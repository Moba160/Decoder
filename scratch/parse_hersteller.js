const fs = require('fs');
const content = fs.readFileSync('g:/Meine Ablage/Eisenbahn/Franky/PlatformIO/FRANKYmini/data/Hersteller.txt', 'utf8');
const lines = content.split('\n').filter(l => l.trim() && !l.startsWith(';'));
const data = lines.map(line => {
    const parts = line.split('|').map(p => p.trim());
    const id = parseInt(parts[0]);
    const name = parts[1];
    const reset = parts[2] || "8=8";
    return { id, name, reset };
});
fs.writeFileSync('g:/Meine Ablage/Eisenbahn/Franky/PlatformIO/Decoderprogrammierung/decoder/hersteller.json', JSON.stringify(data, null, 2));
