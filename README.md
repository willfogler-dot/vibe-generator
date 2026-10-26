# Vibe Generator

Pick music on Spotify and ride a 3D world that reacts to it. MIDI files can also play as jazz covers, and a Spotify song with a matching MIDI gets a ride choreographed to its notes and chords.

## Setup (once)
1. Turn on GitHub Pages for this repo (Settings > Pages > Deploy from branch > `main` / root).
2. Create an app at https://developer.spotify.com/dashboard
   - Redirect URI: the Pages address of this site, exactly, e.g. `https://<user>.github.io/vibe-generator/`
   - APIs: Web API and Web Playback SDK
3. Open the site, paste the app's Client ID, and connect. Spotify Premium is required.

## Making it react
Click **Share audio**, choose **Entire screen**, and turn on **Also share system audio** (Chrome or Edge on Windows). The page only measures the sound; nothing is recorded or sent anywhere.

MIDI files and settings are stored in your browser only.
