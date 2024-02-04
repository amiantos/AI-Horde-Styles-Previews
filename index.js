const config = require("./config.json");
const { AIHorde } = require("@zeldafan0225/ai_horde");
const { setTimeout } = require("node:timers/promises");
const fs = require("fs");
const { baseRequest } = require("./baseRequest");

const promptSamples = {
  person: "a man drinking coffee at a kitchen table in the morning",
  place: "a street level view of New York City at night",
  thing: "a red car parked on the side of the road",
};

var models = {};
var styles = {};
var categories = {};

const main = async () => {
  console.log(
    "Lo! I am the preview generator. On a mountain of skulls, in the castle of pain, I sat on a throne of blood!"
  );

  hordeAPIKey = config.ai_horde_api_key;
  if (hordeAPIKey == null) {
    console.error(
      "Horde API key is required to generate most of these previews."
    );
    return;
  }

  console.log("Fetching models...");
  models = await getJSON(
    "https://raw.githubusercontent.com/Haidra-Org/AI-Horde-image-model-reference/main/stable_diffusion.json"
  );
  console.log("Fetching styles...");
  styles = await getJSON(
    "https://raw.githubusercontent.com/Haidra-Org/AI-Horde-Styles/main/styles.json"
  );
  console.log("Fetching categories...");
  categories = await getJSON(
    "https://raw.githubusercontent.com/Haidra-Org/AI-Horde-Styles/main/categories.json"
  );
  console.log("Okay, let's go!");

  var generationStatus = {};

  for (const [styleName, styleContents] of Object.entries(styles)) {
    const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    generationStatus[styleName] = {};
    console.log("Generating previews for " + styleName + "...");
    for (const [promptType, promptSample] of Object.entries(promptSamples)) {
      const success = await generateImageForStyleAndPrompt(
        safeStyleName,
        styleContents,
        promptType,
        promptSample
      );
      if (success) {
        generationStatus[styleName][promptType] = true;
      } else {
        generationStatus[styleName][promptType] = false;
      }
    }
  }

  // write previews.md and previews.json files
  generateFlatFiles(generationStatus);

  console.log("I am finished!");
};

function generateFlatFiles(generationStatus) {
  fs.writeFileSync("previews.md", "# Style Previews\n\n");
  const previews = {};
  for (const [styleName, promptStatus] of Object.entries(generationStatus)) {
    const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    previews[styleName] = {};

    fs.appendFileSync("previews.md", `## ${styleName}\n`);
    // create table heading for all the prompt types
    for (const promptType of Object.keys(promptStatus)) {
      fs.appendFileSync("previews.md", `| ${promptType} `);
    }
    fs.appendFileSync("previews.md", "|\n");
    for (let i = 0; i < Object.keys(promptStatus).length; i++) {
      fs.appendFileSync("previews.md", `| --- `);
    }
    fs.appendFileSync("previews.md", "|\n");

    for (const [promptType, status] of Object.entries(promptStatus)) {
      if (status) {
        fs.appendFileSync(
          "previews.md",
          `| ![${styleName} ${promptType} preview](/images/${safeStyleName}_${promptType}.webp?raw=true) `
        );
        previews[styleName][
          promptType
        ] = `${config.cdn_url_prefix}/${safeStyleName}_${promptType}.webp`;
      } else {
        fs.appendFileSync("previews.md", `| ❌ `);
      }
    }
    fs.appendFileSync("previews.md", "|\n\n");
  }
  fs.writeFileSync("previews.json", JSON.stringify(previews, null, 2));
  // iterate over categories and create a category .md file for each key
  for (const [category, styles] of Object.entries(categories)) {
    const safeCategoryName = category.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    fs.writeFileSync(`categories/${safeCategoryName}.md`, `# ${category}\n\n`);
    var currentStyles = [];
    var currentCategories = [];
    for (const styleName of styles) {
      if (styleName in categories) {
        currentCategories.push(styleName);
      } else if (styleName in generationStatus) {
        currentStyles.push(styleName);
      }
    }
    for (const styleName of currentCategories) {
      const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      fs.appendFileSync(
        `categories/${safeCategoryName}.md`,
        `- [${styleName}](/categories/${safeStyleName}.md)\n`
      );
    }
    if (currentCategories.length > 0 && currentStyles.length > 0) {
      fs.appendFileSync(`categories/${safeCategoryName}.md`, "\n");
    }
    for (const styleName of currentStyles) {
      const promptStatus = generationStatus[styleName];
      const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      previews[styleName] = {};

      fs.appendFileSync(`categories/${safeCategoryName}.md`, `## ${styleName}\n`);
      // create table heading for all the prompt types
      for (const promptType of Object.keys(promptStatus)) {
        fs.appendFileSync(`categories/${safeCategoryName}.md`, `| ${promptType} `);
      }
      fs.appendFileSync(`categories/${safeCategoryName}.md`, "|\n");
      for (let i = 0; i < Object.keys(promptStatus).length; i++) {
        fs.appendFileSync(`categories/${safeCategoryName}.md`, `| --- `);
      }
      fs.appendFileSync(`categories/${safeCategoryName}.md`, "|\n");

      for (const [promptType, status] of Object.entries(promptStatus)) {
        if (status) {
          fs.appendFileSync(
            `categories/${safeCategoryName}.md`,
            `| ![${styleName} ${promptType} preview](/images/${safeStyleName}_${promptType}.webp?raw=true) `
          );
          previews[styleName][
            promptType
          ] = `${config.cdn_url_prefix}/${safeStyleName}_${promptType}.webp`;
        } else {
          fs.appendFileSync(`categories/${safeCategoryName}.md`, `| ❌ `);
        }
      }
      fs.appendFileSync(`categories/${safeCategoryName}.md`, "|\n\n");
    }
  }
}

async function generateImageForStyleAndPrompt(
  safeStyleName,
  styleContent,
  promptType,
  promptSample
) {
  // Check for model in model reference file
  if (!(styleContent.model in models)) {
    console.error("Invalid model: " + styleContent.model);
    return false;
  }

  const fileName = safeStyleName + "_" + promptType + ".webp";
  if (fs.existsSync("images/" + fileName)) {
    // Skipping generation because image exists
    return true;
  }

  const styleRequest = createRequestForStyleAndPrompt(
    styleContent,
    promptSample
  );

  try {
    const results = await generateImages(styleRequest);
    for (const result of results) {
      await saveResult(result, fileName);
      return true;
    }
  } catch (error) {
    console.error("Error generating image: " + error);
    return false;
  }

  return false;
}

function createRequestForStyleAndPrompt(styleContent, prompt) {
  const model = models[styleContent.model];
  const modelBaseline = model.baseline;

  var styleRequest = structuredClone(baseRequest);
  if (styleContent.model != null) {
    styleRequest.models = [styleContent.model];
  }
  if (styleContent.steps != null) {
    styleRequest.params.steps = styleContent.steps;
  }
  if (styleContent.width != null) {
    styleRequest.params.width = styleContent.width;
  }
  if (styleContent.height != null) {
    styleRequest.params.height = styleContent.height;
  }
  if (styleContent.cfg_scale != null) {
    styleRequest.params.cfg_scale = styleContent.cfg_scale;
  }
  if (styleContent.sampler_name != null) {
    styleRequest.params.sampler_name = styleContent.sampler_name;
  }
  if (styleContent.loras != null) {
    styleRequest.params.loras = styleContent.loras;
  }
  if (styleContent.tis != null) {
    styleRequest.params.tis = styleContent.tis;
  }
  if (modelBaseline.includes("stable_diffusion_xl")) {
    styleRequest.params.hires_fix = false;
  }
  if (styleContent.prompt != null) {
    styleRequest.prompt = styleContent.prompt
      .replace("{p}", prompt)
      .replace("{np}", "");
  }
  return styleRequest;
}

async function saveResult(imageObject, fileName) {
  const imageResponse = await fetch(imageObject.url);
  const imageBuffer = await imageResponse.arrayBuffer();
  fs.writeFileSync("images/" + fileName, Buffer.from(imageBuffer));
}

async function generateImages(request) {
  const apiKey = config.ai_horde_api_key;
  const ai_horde = new AIHorde({
    client_agent: config.client_agent,
    default_token: apiKey,
  });

  // start the generation of an image with the given payload
  const generation = await ai_horde.postAsyncImageGenerate(request);
  console.log(
    "Generation Submitted, ID: " +
      generation.id +
      ", kudos cost: " +
      generation.kudos
  );

  while (true) {
    const check = await ai_horde.getImageGenerationCheck(generation.id);
    if (check.done) {
      console.log("Generation complete.");
      break;
    }
    await setTimeout(3000);
  }

  const generationResult = await ai_horde.getImageGenerationStatus(
    generation.id
  );

  var results = [];
  for (const result of generationResult.generations) {
    if (result.censored) {
      console.error("Censored image detected! Image discarded...");
    } else {
      results.push({ id: result.id, url: result.img });
    }
  }

  return results;
}

async function getJSON(url) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.log(error);
    return {};
  }
}

main();
