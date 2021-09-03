const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const readJsonLinesSync = require("read-json-lines-sync").default;
const npmRunPath = require("npm-run-path");
const GherkinSyntaxError = require("./GherkinSyntaxError");

const parseGherkinDocument = (rawFeatureFile) => {
  // Create a temporary file to write the AST to
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gherkin-parser"));
  const tmpFilePath = path.join(tmpDir, "tmp.feature");

  fs.writeFileSync(tmpFilePath, rawFeatureFile);

  // I have no idea where/how `gherkin-javascript` is being referenced.
  // I assume this is what the command runs: https://github.com/cucumber/gherkin-javascript
  const { status, output, error } = spawnSync(
    `gherkin-javascript`,
    [tmpFilePath],
    {
      encoding: "utf-8",
      env: npmRunPath.env(),
    },
  );

  fs.unlinkSync(tmpFilePath);

  if (error) {
    throw error;
  }

  if (status > 0) {
    throw new Error(
      "Failed to parse the feature file (without an explicit error message)",
    );
  }

  return output;
};

const buildGherkinDocument = (rawFeatureFile) => {
  const rawParsedGherkinJson = parseGherkinDocument(rawFeatureFile);
  const parsedGherkinJsonString = rawParsedGherkinJson
    .filter((item) => !!item)
    .toString();
  const formattedGherkinJson = readJsonLinesSync(parsedGherkinJsonString);

  const errorAttachmentDocument = formattedGherkinJson.find(
    (document) => !!document.attachment,
  );

  const gherkinDocument = formattedGherkinJson.find(
    (document) => !!document.gherkinDocument,
  );

  if (!gherkinDocument && errorAttachmentDocument) {
    throw new GherkinSyntaxError(
      errorAttachmentDocument.attachment.data,
      rawFeatureFile,
    );
  }

  return gherkinDocument.gherkinDocument;
};

const buildAstTree = (gherkinDocument) => {
  const simplifiedAst = { ...gherkinDocument };
  console.log(
    "🚀 ~ file: index.js ~ line 69 ~ buildAstTree ~ simplifiedAst",
    simplifiedAst,
  );
  console.log(
    "🚀 ~ file: index.js ~ line 70 ~ buildAstTree ~ gherkinDocument",
    gherkinDocument,
  );
  delete simplifiedAst.uri;

  console.log(
    "🚀 ~ file: index.js ~ line 69 ~ buildAstTree ~ simplifiedAst",
    simplifiedAst,
  );

  return simplifiedAst;
};

const isStepKeyword = (keyword) => {
  return ["given", "when", "then", "and", "but"].includes(
    keyword.toLowerCase().trim(),
  );
};

const flattenAst = (nodes, oneNode) => {
  let result = [...nodes];

  if (oneNode.comments) {
    const comments = oneNode.comments;

    comments.forEach((oneComment) => {
      result.push({
        type: "comment",
        text: oneComment.text,
        location: oneComment.location,
      });
    });
  }

  if (oneNode.feature) {
    const feature = oneNode.feature;

    result.push({
      type: "feature",
      keyword: feature.keyword,
      name: feature.name || null,
      description: feature.description || null,
      tags: feature.tags
        ? feature.tags.map((oneNodeTag) => ({
            name: oneNodeTag.name,
            location: oneNodeTag.location,
          }))
        : [],
      language: feature.language,
      location: feature.location,
    });

    if (feature.children && feature.children.length > 0) {
      result = result.concat(...feature.children.reduce(flattenAst, []));
    }
  } else if (oneNode.scenario) {
    const scenario = oneNode.scenario;

    result.push({
      type: "scenario",
      keyword: scenario.keyword,
      name: scenario.name || null,
      description: scenario.description || null,
      tags: scenario.tags
        ? scenario.tags.map((oneNodeTag) => ({
            name: oneNodeTag.name,
            location: oneNodeTag.location,
          }))
        : [],
      location: scenario.location,
    });

    if (scenario.steps && scenario.steps.length > 0) {
      result = result.concat(...scenario.steps.reduce(flattenAst, []));
    }
  } else if (oneNode.keyword && isStepKeyword(oneNode.keyword)) {
    result.push({
      type: "step",
      keyword: oneNode.keyword,
      text: oneNode.text || null,
      location: oneNode.location,
    });
  } else {
    result.push({
      type: "unknown",
      ...oneNode,
    });
  }

  return result;
};

const sortFlatAstByLocation = (nodeA, nodeB) => {
  if (nodeA.location.line < nodeB.location.line) {
    return -1;
  } else if (nodeA.location.line > nodeB.location.line) {
    return 1;
  } else if (nodeA.location.line === nodeB.location.line) {
    if (nodeA.location.column < nodeB.location.column) {
      return -1;
    } else if (nodeA.location.column > nodeB.location.column) {
      return 1;
    }
  }

  return 0;
};

const parseGherkin = (rawFeatureFile /*, parsers, options*/) => {
  const gherkinDocument = buildGherkinDocument(rawFeatureFile);
  const astTree = buildAstTree(gherkinDocument);
  const flatAst = [astTree].reduce(flattenAst, []).sort(sortFlatAstByLocation);

  return flatAst;
};

module.exports = parseGherkin;
