import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import JSZip from "jszip";
import { readFileForClaude } from "../lib/files.js";

test("PDFs are passed to Claude as documents", async () => {
  const pdf = fs.readFileSync(new URL("../lib/demo-files/biol230-lecture15-membrane-transport.pdf", import.meta.url));
  const out = await readFileForClaude(pdf, "Lecture.pdf", "application/pdf");
  assert.ok(out.pdf.length > 1000);
});

test("PowerPoint: slide text in numeric order, with speaker notes", async () => {
  const z = new JSZip();
  z.file("ppt/slides/slide1.xml", "<a:p><a:r><a:t>Intro</a:t></a:r></a:p>");
  z.file("ppt/slides/slide10.xml", "<a:p><a:r><a:t>Summary &amp; review</a:t></a:r></a:p>");
  z.file("ppt/slides/slide2.xml", "<a:p><a:r><a:t>Chain </a:t></a:r><a:r><a:t>rule</a:t></a:r></a:p>");
  z.file("ppt/notesSlides/notesSlide2.xml", "<a:p><a:r><a:t>Multiply by the inside derivative</a:t></a:r></a:p>");
  const { text } = await readFileForClaude(await z.generateAsync({ type: "nodebuffer" }), "deck.pptx");
  assert.ok(text.indexOf("Slide 1") < text.indexOf("Slide 2") && text.indexOf("Slide 2") < text.indexOf("Slide 10"));
  assert.match(text, /Chain rule/);
  assert.match(text, /Speaker notes: Multiply by the inside derivative/);
  assert.match(text, /Summary & review/);
});

test("Word documents are read as text", async () => {
  const docx = fs.readFileSync(new URL("../lib/demo-files/hist120-primary-source-guide.docx", import.meta.url));
  const { text } = await readFileForClaude(docx, "guide.docx");
  assert.match(text, /Primary Source Analysis Guide/);
  assert.match(text, /Historical context/);
});

test("images go to Claude as images", async () => {
  const png = fs.readFileSync(new URL("../public/icons/icon-192.png", import.meta.url));
  const out = await readFileForClaude(png, "notes.png", "image/png");
  assert.equal(out.mediaType, "image/png");
});

test("unsupported and damaged files explain themselves", async () => {
  assert.match((await readFileForClaude(Buffer.from("x"), "old.ppt")).text, /can't read yet/);
  assert.match((await readFileForClaude(Buffer.from("not a zip"), "bad.docx")).text, /damaged/);
});
