import { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

/**
 * Vite plugin that auto-discovers use case folders in public/content/use-cases
 * and generates a virtual module with the list of use case slugs.
 */
export function useCaseDiscoveryPlugin(): Plugin {
  const virtualModuleId = 'virtual:usecase-registry';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  const useCasesDir = path.resolve(process.cwd(), 'public/content/use-cases');

  function discoverUseCases(): string[] {
    if (!fs.existsSync(useCasesDir)) {
      return [];
    }

    const entries = fs.readdirSync(useCasesDir, { withFileTypes: true });
    const slugs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const indexPath = path.join(useCasesDir, entry.name, 'index.md');
        if (fs.existsSync(indexPath)) {
          slugs.push(entry.name);
        }
      }
    }

    return slugs.sort();
  }

  return {
    name: 'usecase-discovery',

    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },

    load(id) {
      if (id === resolvedVirtualModuleId) {
        const slugs = discoverUseCases();
        return `export const useCaseSlugs = ${JSON.stringify(slugs)};`;
      }
    },

    configureServer(server) {
      server.watcher.add(useCasesDir);

      server.watcher.on('all', (_event, filePath) => {
        if (filePath.startsWith(useCasesDir)) {
          const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }
        }
      });
    },
  };
}
