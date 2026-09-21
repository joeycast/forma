# Third-party notices

Forma's original code is MIT licensed. Third-party code and assets retain their licenses. The lockfile identifies exact installed versions; source distributions in `node_modules` contain applicable notices. Preserve their license notices when redistributing bundled software.

| Component                  | Purpose                             | License / upstream                                                                                               |
| -------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ELK / elkjs                | Layered graph layout                | [EPL-2.0](https://github.com/kieler/elkjs/blob/master/LICENSE.md)                                                |
| React Flow / @xyflow/react | Graphical interaction               | [MIT](https://github.com/xyflow/xyflow/blob/main/LICENSE)                                                        |
| React and React DOM        | Editor UI                           | [MIT](https://github.com/facebook/react/blob/main/LICENSE)                                                       |
| Zod                        | Native document validation          | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE)                                                       |
| Lucide                     | Interface icons                     | [ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE)                                                  |
| resvg-js                   | CLI PNG rasterization               | [MPL-2.0](https://github.com/yisibl/resvg-js/blob/main/LICENSE)                                                  |
| IBM Plex Sans              | Bundled typography                  | [SIL OFL 1.1](public/fonts/OFL.txt)                                                                              |
| Vite                       | Development and static build        | [MIT](https://github.com/vitejs/vite/blob/main/LICENSE)                                                          |
| TypeScript                 | Type checking                       | [Apache-2.0](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt)                                      |
| Google Auth Library        | Hosted Google identity verification | [Apache-2.0](https://github.com/googleapis/google-cloud-node/tree/main/core/packages/google-auth-library-nodejs) |
| MCP TypeScript SDK         | Optional hosted agent adapter       | [MIT](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE)                                  |
| tsx                        | TypeScript CLI runtime              | [MIT](https://github.com/privatenumber/tsx/blob/master/LICENSE)                                                  |

ELK and resvg remain separate third-party components under their upstream terms. There are no proprietary runtime dependencies. Local/static modes need no operated service; optional hosted sign-in uses Google identity through the organization’s own OAuth client. This table covers principal direct dependencies, not every transitive package; use installed package licenses and the lockfile for a complete redistribution inventory.
