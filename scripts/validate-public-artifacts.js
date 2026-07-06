#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.cwd();

function fail(message) {
  console.error(`public artifact validation failed: ${message}`);
  process.exit(1);
}

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert(fs.existsSync(fullPath), `missing required file: ${relativePath}`);
  assert(fs.statSync(fullPath).isFile(), `required path is not a file: ${relativePath}`);
  return fullPath;
}

function validateAnalysisResult(relativePath) {
  const doc = readJson(relativePath);
  assert(doc.schemaVersion === "0.1", `${relativePath}: schemaVersion must be "0.1"`);
  assert(typeof doc.txHash === "string" && doc.txHash.length > 0, `${relativePath}: txHash required`);
  assert(typeof doc.chain === "string" && doc.chain.length > 0, `${relativePath}: chain required`);
  assert(doc.summary && typeof doc.summary.status === "string", `${relativePath}: summary.status required`);
  assert(doc.graph && Array.isArray(doc.graph.nodes), `${relativePath}: graph.nodes must be an array`);
  assert(doc.graph && Array.isArray(doc.graph.edges), `${relativePath}: graph.edges must be an array`);
  assert(Array.isArray(doc.constraints), `${relativePath}: constraints must be an array`);
  assert(Array.isArray(doc.evidence), `${relativePath}: evidence must be an array`);

  const nodeIds = new Set(doc.graph.nodes.map(node => node.id));
  for (const edge of doc.graph.edges) {
    assert(typeof edge.id === "string" && edge.id.length > 0, `${relativePath}: edge id required`);
    assert(nodeIds.has(edge.source), `${relativePath}: edge ${edge.id} source node missing`);
    assert(nodeIds.has(edge.target), `${relativePath}: edge ${edge.id} target node missing`);
    assert(typeof edge.action === "string" && edge.action.length > 0, `${relativePath}: edge ${edge.id} action required`);
  }

  const edgeIds = new Set(doc.graph.edges.map(edge => edge.id));
  for (const step of doc.evidence) {
    assert(typeof step.index === "number", `${relativePath}: evidence.index must be numeric`);
    if (step.edgeId !== undefined) {
      assert(edgeIds.has(step.edgeId), `${relativePath}: evidence edge ${step.edgeId} missing`);
    }
  }
}

function validateTechnicalReport() {
  const texPath = "docs/technical-report/evanesca-technical-report.tex";
  const pdfPath = "docs/technical-report/evanesca-technical-report.pdf";

  const pdfFullPath = assertFile(pdfPath);
  const pdf = fs.readFileSync(pdfFullPath);
  assert(pdf.subarray(0, 4).toString("utf8") === "%PDF", `${pdfPath}: missing PDF header`);
  assert(pdf.length > 100000, `${pdfPath}: PDF unexpectedly small`);

  const texFullPath = path.join(root, texPath);
  if (!fs.existsSync(texFullPath)) return;

  const tex = fs.readFileSync(texFullPath, "utf8");
  assert(
    tex.includes("\\documentclass[acmlarge,anonymous"),
    `${texPath}: expected acmart acmlarge anonymous format`
  );
  assert(
    tex.includes("\\usepackage{libertine}"),
    `${texPath}: expected libertine package`
  );
  assert(
    tex.includes("imc-src/introduction") &&
      tex.includes("imc-src/methodology") &&
      tex.includes("imc-src/results"),
    `${texPath}: expected IMC manuscript source inputs`
  );

  for (const sourceFile of [
    "docs/technical-report/imc-src/introduction.tex",
    "docs/technical-report/imc-src/methodology.tex",
    "docs/technical-report/imc-src/results.tex",
    "docs/technical-report/imc-src/related-discussion.tex",
    "docs/technical-report/imc-src/conclusion.tex",
    "docs/technical-report/imc-src/Evanesca.bib",
    "docs/technical-report/imc-src/figures/new_overview.pdf",
    "docs/technical-report/imc-src/figures/runningExample.pdf",
    "docs/technical-report/imc-src/figures/arbitrage_patterns.pdf",
    "docs/technical-report/imc-src/figures/case_tend.pdf",
  ]) {
    assertFile(sourceFile);
  }
}

function validateManifest() {
  const manifest = readJson("docs/example-datasets/manifest.json");
  assert(manifest.schemaVersion === "0.1", "manifest schemaVersion must be 0.1");
  assert(Array.isArray(manifest.datasets), "manifest.datasets must be an array");
  for (const dataset of manifest.datasets) {
    assert(typeof dataset.path === "string", "manifest dataset path required");
    assert(typeof dataset.kind === "string", `manifest ${dataset.path}: kind required`);
    const fullPath = path.join(root, dataset.path);
    assert(fs.existsSync(fullPath), `manifest references missing file: ${dataset.path}`);
    if (dataset.kind === "analysis_result") {
      validateAnalysisResult(dataset.path);
    }
  }
}

function countCsvRows(relativePath) {
  const text = fs.readFileSync(path.join(root, relativePath), "utf8").trim();
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  return Math.max(0, lines.length - 1);
}

function validatePublicArtifactFile(file) {
  assert(typeof file.path === "string", "artifact file path required");
  assert(typeof file.kind === "string", `${file.path}: artifact file kind required`);
  assert(fs.existsSync(path.join(root, file.path)), `artifact manifest references missing file: ${file.path}`);

  if (file.kind === "csv_with_header") {
    assert(
      countCsvRows(file.path) === file.expectedRows,
      `${file.path}: expected ${file.expectedRows} CSV rows`
    );
    return;
  }

  const doc = readJson(file.path);
  if (file.kind === "hash_list") {
    assert(doc.count === file.expectedRows, `${file.path}: count mismatch`);
    assert(Array.isArray(doc.hashes), `${file.path}: hashes must be an array`);
    assert(doc.hashes.length === file.expectedRows, `${file.path}: hashes length mismatch`);
    return;
  }

  if (file.kind === "pm_hash_list") {
    assert(doc.pm_count === file.expectedRows, `${file.path}: pm_count mismatch`);
    assert(Array.isArray(doc.pm_hashes), `${file.path}: pm_hashes must be an array`);
    assert(doc.pm_hashes.length === file.expectedRows, `${file.path}: pm_hashes length mismatch`);
    return;
  }

  if (file.kind === "defect_master") {
    assert(doc.totals && doc.totals.total === file.expectedTotal, `${file.path}: totals.total mismatch`);
    return;
  }

  if (file.kind === "audit_report") {
    assert(doc.summary && doc.summary.total === file.expectedTotal, `${file.path}: summary.total mismatch`);
    assert(Array.isArray(doc.per_hash), `${file.path}: per_hash must be an array`);
    assert(doc.per_hash.length === file.expectedTotal, `${file.path}: per_hash length mismatch`);
    return;
  }

  if (file.kind === "non_baseline_master") {
    assert(doc.total_unique_hashes === file.expectedTotal, `${file.path}: total_unique_hashes mismatch`);
    assert(Array.isArray(doc.all_hashes_sorted), `${file.path}: all_hashes_sorted must be an array`);
    assert(doc.all_hashes_sorted.length === file.expectedTotal, `${file.path}: all_hashes_sorted length mismatch`);
    return;
  }
}

function validatePublicArtifactsManifest() {
  const manifestPath = "docs/reproducible-artifacts/public-artifacts.manifest.json";
  if (!fs.existsSync(path.join(root, manifestPath))) return;
  const manifest = readJson(manifestPath);
  assert(manifest.schemaVersion === "0.1", "public artifact manifest schemaVersion must be 0.1");
  assert(Array.isArray(manifest.artifacts), "public artifact manifest artifacts must be an array");
  for (const artifact of manifest.artifacts) {
    assert(typeof artifact.id === "string", "artifact id required");
    assert(typeof artifact.path === "string", `${artifact.id}: artifact path required`);
    assert(fs.existsSync(path.join(root, artifact.path)), `${artifact.id}: artifact path missing`);
    assert(Array.isArray(artifact.files), `${artifact.id}: files must be an array`);
    for (const file of artifact.files) {
      validatePublicArtifactFile(file);
    }
  }
}

validateManifest();
validatePublicArtifactsManifest();
validateTechnicalReport();
console.log("public artifact validation passed");
