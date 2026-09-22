export const setupPrompt = `Set up Forma, the open-source local diagramming tool, and use it for my diagrams.

1. Check that Node.js 22 or newer and npm are installed. Explain any missing prerequisite before changing system configuration.
2. Install Forma from its official release: npm install -g https://github.com/joeycast/forma/releases/download/v0.5.2/forma-diagrams-0.5.2.tgz
3. Use ~/Forma as my diagram folder unless I specify another location. Keep related diagrams in subfolders. Never overwrite existing files during setup.
4. Locate the installed package with npm root -g, then read forma-diagrams/skills/forma/SKILL.md. Read only the specialized diagram skills needed for my requests. Skills guide composition; a diagram type is not required. If your harness supports repository skills, follow its normal discovery process rather than assuming a specific agent platform.
5. Start forma serve --directory ~/Forma and give me the local URL it prints. Keep that process running while I use the editor. This is a local file server, not an internet-facing service.
6. Create or update .forma.json files directly in that folder using Forma's CLI/core API. Preserve stable IDs and human position/style overrides. Validate, inspect, render, and view each diagram before delivery; refine visual problems instead of stopping at valid JSON.
7. Tell me to open Library and refresh to see new files. The editor's Save button writes back to the same file. Before editing again, read the latest file from disk. Export SVG/PNG alongside the native document when requested.
8. For my organization's visual identity, help me create a design-system JSON in the app's Design systems editor, export it into my repository, and apply it with forma style DIAGRAM --system BRAND.json.

Once setup works, ask what I want to diagram. Do not configure cloud accounts, publish my diagrams, or enable a public server as part of local setup.`;
