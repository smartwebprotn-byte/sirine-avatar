import fs from 'fs';
import path from 'path';

function fixEsbuild(dir) {
    const esbuildExe = path.join(dir, 'esbuild.exe');
    const gesbuildExe = path.join(dir, 'gesbuild.exe');

    if (fs.existsSync(gesbuildExe)) {
        if (fs.existsSync(esbuildExe)) {
            const stats = fs.statSync(esbuildExe);
            if (stats.size < 1000000) { // If it's less than 1MB, it's likely the "shim"
                const backup = esbuildExe + '.bak';
                if (!fs.existsSync(backup)) {
                    fs.renameSync(esbuildExe, backup);
                } else {
                    fs.unlinkSync(esbuildExe);
                }
                fs.copyFileSync(gesbuildExe, esbuildExe);
                console.log(`Fixed esbuild binary in ${dir}`);
            }
        } else {
            fs.copyFileSync(gesbuildExe, esbuildExe);
            console.log(`Restored esbuild binary from gesbuild in ${dir}`);
        }
    }
}

const paths = [
    'node_modules/@esbuild/win32-x64',
    'node_modules/vite/node_modules/@esbuild/win32-x64'
];

paths.forEach(p => {
    const fullPath = path.resolve(p);
    if (fs.existsSync(fullPath)) {
        fixEsbuild(fullPath);
    }
});
