## [Releases History](../../releases)

Explore previous versions, changelogs, and downloadable artifacts on the project's Releases page.
# RPS AI Predictor
Interactive Rock-Paper-Scissors predictor built with React, Framer Motion, and a collection of ensemble AI forecasters.

# Installation guides

## Docker (Recommended)

1. Build the image: `docker build -t rps-predictor .`
2. Run the container: `docker run --rm -p 8080:80 rps-predictor`
3. Visit http://localhost:8080 to play the game.

The Docker image uses a multi-stage build (Node for compilation, Nginx for serving static files). Rebuild the image whenever you change application code.

## Local development

1. Install dependencies: `npm install`
2. Build project with `npm run build`
3. Start the Vite dev server: `npm run dev`
4. Open the URL that Vite prints (defaults to http://localhost:5173).

## Windows batch launcher

For a one-click experience on Windows, use the provided `launch_RPS_Predictor.bat` script (stored alongside `package.json`). The
launcher automatically:

- Switches to the project directory where the batch file lives so it stays portable if you move the folder.
- Verifies that Node.js and npm are available, stopping with helpful guidance if either is missing.
- Installs dependencies on demand by running `npm install` whenever `node_modules/` is absent.
- Starts the development server in a new Command Prompt window (`npm run dev`).
- Opens your default browser to http://localhost:5173 after giving the server a moment to boot.

Just double-click the batch file to start the predictor; close the new Command Prompt window to stop the dev server when you are
done.
