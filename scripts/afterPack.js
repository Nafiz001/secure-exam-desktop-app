const fs = require('fs');
const path = require('path');

/**
 * electron-builder's extraResources copier silently drops node_modules
 * (its directory-copy helper hard-excludes it), even with an explicit
 * "node_modules/**\/*" filter entry. Copy the backend's production
 * node_modules into the packaged resources ourselves as a lifecycle hook.
 */
module.exports = async function afterPack(context) {
  const backendSrc = path.join(__dirname, '..', 'backend');
  const backendDest = path.join(context.appOutDir, 'resources', 'backend');

  const nodeModulesSrc = path.join(backendSrc, 'node_modules');
  const nodeModulesDest = path.join(backendDest, 'node_modules');

  if (!fs.existsSync(nodeModulesSrc)) {
    throw new Error(`[afterPack] backend/node_modules not found at ${nodeModulesSrc} — run "npm run install:backend" first.`);
  }

  fs.cpSync(nodeModulesSrc, nodeModulesDest, { recursive: true, dereference: true });
  console.log(`[afterPack] Copied backend/node_modules -> ${nodeModulesDest} (${fs.readdirSync(nodeModulesDest).length} top-level entries)`);

  // backend/.gitignore excludes .env (correctly, for source control), but
  // electron-builder's extraResources copier also respects that nested
  // .gitignore, so the packaged app would otherwise ship with no runtime
  // config at all. Copy it in explicitly so the packaged backend can boot.
  const envSrc = path.join(backendSrc, '.env');
  const envDest = path.join(backendDest, '.env');
  if (fs.existsSync(envSrc)) {
    fs.copyFileSync(envSrc, envDest);
    console.log(`[afterPack] Copied backend/.env -> ${envDest}`);
  } else {
    console.warn(`[afterPack] WARNING: ${envSrc} does not exist — packaged app will have no DB/JWT config.`);
  }
};
