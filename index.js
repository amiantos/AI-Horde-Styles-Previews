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

const paramsToCopy = [
  "steps",
  "width",
  "height",
  "cfg_scale",
  "clip_skip",
  "enhance",
  "hires_fix",
  "karras",
  "sampler_name",
  "loras",
  "tis",
];

const stylesToSkip = ["stonehenge sunrise"]

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

  console.log("Performing sanity checks...");

  // Perform a sanity check, look through styles and make sure every param present is accounted for in paramsToCopy
  let errorFound = false;
  for (const [styleName, styleContents] of Object.entries(styles)) {
    for (const param of Object.keys(styleContents)) {
      if (
        !paramsToCopy.includes(param) &&
        param != "model" &&
        param != "prompt"
      ) {
        console.error(
          `Style ${styleName} has a parameter ${param} that is not accounted for in paramsToCopy.`
        );
        errorFound = true;
      }
    }
  }
  if (errorFound) {
    console.error("Errors found during the sanity check. Aborting script.");
    return;
  }

  console.log("Pruning removed styles from storage...");
  const lastRunStyles = fs.existsSync("styles.last-run.json")
    ? JSON.parse(fs.readFileSync("styles.last-run.json"))
    : {};
  for (const [styleName, styleContents] of Object.entries(lastRunStyles)) {
    if (!(styleName in styles)) {
      console.log("Removing style " + styleName + " from storage.");

      const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      for (const promptType of Object.keys(promptSamples)) {
        const fileName = safeStyleName + "_" + promptType + ".webp";
        if (fs.existsSync("images/" + fileName)) {
          fs.unlinkSync("images/" + fileName);
        }
      }
      const hashFile = `hashes/${safeStyleName}_hash.txt`;
      if (fs.existsSync(hashFile)) {
        fs.unlinkSync(hashFile);
      }
    }
  }

  console.log("Okay, let's go!");

  var generationStatus = {};

  for (const [styleName, styleContents] of Object.entries(styles)) {

    const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    generationStatus[styleName] = {};

    if (stylesToSkip.includes(styleName)) {
      console.log("Skipping previews for " + styleName + "...");
      for (const promptType of Object.keys(promptSamples)) {
        generationStatus[styleName][promptType] = false;
      }
      continue;
    }

    console.log("Generating previews for " + styleName + "...");

    // check if all images exist already
    var allImagesExist = true;
    for (const promptType of Object.keys(promptSamples)) {
      const fileName = safeStyleName + "_" + promptType + ".webp";
      if (!fs.existsSync("images/" + fileName)) {
        allImagesExist = false;
        break;
      }
    }

    // Hash the contents of the style to determine if it needs to be regenerated
    const hash = require("crypto")
      .createHash("md5")
      .update(JSON.stringify(styleContents))
      .digest("hex");
    const hashFile = `hashes/${safeStyleName}_hash.txt`;
    if (fs.existsSync(hashFile)) {
      const oldHash = fs.readFileSync(hashFile, "utf8");
      if (allImagesExist) {
        if (oldHash === hash) {
          console.log(
            "Skipping generation for " +
              styleName +
              " because the contents have not changed."
          );
          for (const promptType of Object.keys(promptSamples)) {
            generationStatus[styleName][promptType] = true;
          }
          continue;
        } else {
          console.log(
            "Regenerating previews for " +
              styleName +
              " because the contents have changed."
          );
          for (const promptType of Object.keys(promptSamples)) {
            const fileName = safeStyleName + "_" + promptType + ".webp";
            if (fs.existsSync("images/" + fileName)) {
              fs.unlinkSync("images/" + fileName);
            }
          }
        }
      }
    }
    fs.writeFileSync(hashFile, hash);

    const generationPromises = Object.entries(promptSamples).map(
      async ([promptType, promptSample], index) => {
        await setTimeout(index * 2000);
        const success = await generateImageForStyleAndPrompt(
          safeStyleName,
          styleContents,
          promptType,
          promptSample
        );
        generationStatus[styleName][promptType] = success;
      }
    );

    await Promise.all(generationPromises);
  }

  // write previews.md and previews.json files
  generateFlatFiles(generationStatus);

  // Save styles to styles.last-run.json
  fs.writeFileSync("styles.last-run.json", JSON.stringify(styles, null, 2));

  console.log("I am finished!");
};

function generateFlatFiles(generationStatus) {
  fs.writeFileSync("previews.md", "# Style Previews\n\n");
  const previews = {};
  for (const [styleName, promptStatus] of Object.entries(generationStatus)) {
    const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    previews[styleName] = {};

    // write to file
    appendStyleTableToFile("previews.md", styleName, promptStatus);

    // generate previews object for json export
    for (const [promptType, status] of Object.entries(promptStatus)) {
      if (status) {
        previews[styleName][
          promptType
        ] = `${config.cdn_url_prefix}/${safeStyleName}_${promptType}.webp`;
      }
    }
  }

  // export previews object to json
  fs.writeFileSync("previews.json", JSON.stringify(previews, null, 2));

  // iterate over categories and create a category .md file for each key
  for (const [category, styles] of Object.entries(categories)) {
    const safeCategoryName = category.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    fs.writeFileSync(`categories/${safeCategoryName}.md`, `# ${category}\n\n`);

    // go through objects in category to sort them into categories and styles
    var currentStyles = [];
    var currentCategories = [];
    for (const styleName of styles) {
      if (styleName in categories) {
        currentCategories.push(styleName);
      } else if (styleName in generationStatus) {
        currentStyles.push(styleName);
      }
    }
    // print categories at the top of the file
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
    // print styles at the bottom of the file
    for (const styleName of currentStyles) {
      const promptStatus = generationStatus[styleName];
      previews[styleName] = {};

      appendStyleTableToFile(
        `categories/${safeCategoryName}.md`,
        styleName,
        promptStatus
      );
    }
  }
}

function appendStyleTableToFile(fileName, styleName, promptStatus) {
  const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  fs.appendFileSync(fileName, `## ${styleName}\n`);
  // create table heading for all the prompt types
  for (const promptType of Object.keys(promptStatus)) {
    fs.appendFileSync(fileName, `| ${promptType} `);
  }
  fs.appendFileSync(fileName, "|\n");
  for (let i = 0; i < Object.keys(promptStatus).length; i++) {
    fs.appendFileSync(fileName, `| --- `);
  }
  fs.appendFileSync(fileName, "|\n");

  for (const [promptType, status] of Object.entries(promptStatus)) {
    if (status) {
      fs.appendFileSync(
        fileName,
        `| ![${styleName} ${promptType} preview](/images/${safeStyleName}_${promptType}.webp?raw=true) `
      );
    } else {
      fs.appendFileSync(fileName, `| ❌ `);
    }
  }
  fs.appendFileSync(fileName, "|\n\n");
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
  var styleRequest = structuredClone(baseRequest);
  if (styleContent.model != null) {
    styleRequest.models = [styleContent.model];
  }

  for (const param of paramsToCopy) {
    if (styleContent[param] != null) {
      styleRequest.params[param] = styleContent[param];
    }
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
    await setTimeout(15000);
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
