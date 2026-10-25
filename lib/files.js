// Turns Canvas course files into something Claude can read:
// PDFs and images go to Claude as-is; Word and PowerPoint files are unzipped
// and their text (plus PowerPoint speaker notes) is extracted.
import JSZip from "jszip";

const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

// Text runs inside each paragraph, one paragraph per line.
function paragraphs(xml, paraTag, textTag) {
  return xml
    .split(new RegExp(`</${paraTag}>`))
    .map((p) => [...p.matchAll(new RegExp(`<${textTag}(?: [^>]*)?>([^<]*)</${textTag}>`, "g"))].map((m) => decode(m[1])).join(""))
    .filter((line) => line.trim());
}

const slideNumber = (path) => Number(path.match(/(\d+)\.xml$/)?.[1] || 0);

async function docxText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file("word/document.xml")?.async("string");
  if (!doc) throw new Error("not a Word document");
  return paragraphs(doc, "w:p", "w:t").join("\n");
}

async function pptxText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (!slides.length) throw new Error("no slides found");
  const out = [];
  for (const path of slides) {
    const n = slideNumber(path);
    const text = paragraphs(await zip.file(path).async("string"), "a:p", "a:t");
    const notesXml = await zip.file(`ppt/notesSlides/notesSlide${n}.xml`)?.async("string");
    const notes = notesXml ? paragraphs(notesXml, "a:p", "a:t").filter((l) => !/^\d+$/.test(l.trim())) : [];
    out.push(`## Slide ${n}\n${text.join("\n") || "(no text on this slide)"}${notes.length ? `\nSpeaker notes: ${notes.join(" ")}` : ""}`);
  }
  return out.join("\n\n");
}

// Returns { pdf } | { image, mediaType } | { text } for the agent.
export async function readFileForClaude(buf, name, contentType = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (contentType === "application/pdf" || ext === "pdf") return { pdf: buf.toString("base64"), name };

  if (IMAGE_TYPES[ext] || /^image\/(png|jpeg|gif|webp)$/.test(contentType)) {
    if (buf.length > MAX_IMAGE_BYTES) return { text: `"${name}" is an image over 5 MB, too large to read here. Ask the student to open it in Canvas.` };
    return { image: buf.toString("base64"), mediaType: IMAGE_TYPES[ext] || contentType, name };
  }

  if (ext === "docx" || ext === "pptx") {
    try {
      const text = ext === "docx" ? await docxText(buf) : await pptxText(buf);
      return { text: `# ${name}\n\n${text || "(This file has no readable text.)"}` };
    } catch (err) {
      return { text: `Couldn't read "${name}"; the file may be damaged or password-protected. Ask the student to open it in Canvas.` };
    }
  }

  if (contentType.startsWith("text/") || /^(txt|md|csv|html?)$/.test(ext)) return { text: `# ${name}\n\n${buf.toString("utf8")}`, html: /^html?$/.test(ext) };

  const hint = /^(doc|ppt|xls|xlsx|key|pages|heic)$/.test(ext)
    ? " Older Office files and Apple Keynote/Pages files can't be read yet; a PDF or .docx/.pptx version would work."
    : "";
  return { text: `"${name}" is a ${contentType || ext || "binary"} file that Cuss can't read yet.${hint} Ask the student to open it in Canvas.` };
}
