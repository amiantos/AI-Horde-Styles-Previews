# AI Horde Styles Preview Generator

This repo contains preview images for [AI Horde Styles](https://github.com/Haidra-Org/AI-Horde-Styles), as well as the node script used to generate them.

## How to use
- View images by category by going to [/categories](/categories)
- You can view all the images by going to [/previews.md](previews.md)
- If you are building a Horde integration, fetch [/previews.json](previews.json) to get image urls to use in your app.

## How to generate images
- Copy `config.json.example` to `config.json` and fill out what you need
- `npm i`
- `node index.js`

## How to change what previews are generated
- Open up `index.js`
- Change the `promptSamples` object to suit your interests
- You may also want to change the base seed in `baseRequest.js`
- Run the script again
