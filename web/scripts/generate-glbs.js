const fs = require('fs');
const path = require('path');

/**
 * Node.js script to convert PNG icons to GLB models.
 * This runs during the build process to avoid runtime overhead.
 */

const SOURCE_DIR = path.join(__dirname, '../public/icons/to-glb');
const OUTPUT_DIR = path.join(__dirname, '../public/SampleData/models/Generated');

if (!fs.existsSync(SOURCE_DIR)) {
    console.log('Source directory icons/to-glb does not exist. Skipping.');
    process.exit(0);
}

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function convertPngToGlb(fileName) {
    const filePath = path.join(SOURCE_DIR, fileName);
    const outputFileName = fileName.replace(/\.[^/.]+$/, "") + ".glb";
    const outputPath = path.join(OUTPUT_DIR, outputFileName);

/*
    // EĞER DOSYA ZATEN VARSA ATLA (Basit Kontrol)
    if (fs.existsSync(outputPath)) {
        // console.log(`Skipping: ${outputFileName} already exists.`);
        return; 
    }
*/
    console.log(`Converting: ${fileName} -> ${outputFileName}`);

    const imgBytes = fs.readFileSync(filePath);
    const sizeMeters = 50; // Default size similar to runtime manager

    // Geometry data (Quad)
    const halfW = sizeMeters / 2;
    const halfH = sizeMeters / 2;

    const indices = Buffer.from(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer);
    const positions = Buffer.from(new Float32Array([
        -halfW, 0, -halfH,
         halfW, 0, -halfH,
         halfW, 0,  halfH,
        -halfW, 0,  halfH,
    ]).buffer);
    const normals = Buffer.from(new Float32Array([
        0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    ]).buffer);
    const texcoords = Buffer.from(new Float32Array([
        0, 0,  1, 0,  1, 1,  0, 1,
    ]).buffer);

    // Binary Buffer construction
    const geomSize = 12 + 48 + 48 + 32;
    const geomPadding = (4 - (geomSize % 4)) % 4;
    const imgOffset = geomSize + geomPadding;
    const totalBinSize = imgOffset + imgBytes.length;
    const binPadding = (4 - (totalBinSize % 4)) % 4;
    const paddedBinSize = totalBinSize + binPadding;

    const binBuffer = Buffer.alloc(paddedBinSize);
    let offset = 0;
    indices.copy(binBuffer, offset); offset += 12;
    positions.copy(binBuffer, offset); offset += 48;
    normals.copy(binBuffer, offset); offset += 48;
    texcoords.copy(binBuffer, offset); offset += 32;
    offset += geomPadding;
    imgBytes.copy(binBuffer, offset);

    // glTF JSON
    const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const gltf = {
        asset: { version: "2.0", generator: "node-glb-generator" },
        extensionsUsed: ["KHR_materials_unlit"],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{
            primitives: [{
                attributes: { POSITION: 1, NORMAL: 2, TEXCOORD_0: 3 },
                indices: 0,
                material: 0,
            }],
        }],
        materials: [{
            pbrMetallicRoughness: {
                baseColorTexture: { index: 0 },
                metallicFactor: 0,
                roughnessFactor: 1,
            },
            extensions: { KHR_materials_unlit: {} },
            alphaMode: "BLEND",
            doubleSided: true,
        }],
        textures: [{ source: 0, sampler: 0 }],
        samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
        images: [{ bufferView: 4, mimeType: mimeType }],
        accessors: [
            { bufferView: 0, componentType: 5123, count: 6, type: "SCALAR", max: [3], min: [0] },
            { bufferView: 1, componentType: 5126, count: 4, type: "VEC3", max: [halfW, 0, halfH], min: [-halfW, 0, -halfH] },
            { bufferView: 2, componentType: 5126, count: 4, type: "VEC3", max: [0, 1, 0], min: [0, 1, 0] },
            { bufferView: 3, componentType: 5126, count: 4, type: "VEC2", max: [1, 1], min: [0, 0] },
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 12, target: 34963 },
            { buffer: 0, byteOffset: 12, byteLength: 48, target: 34962 },
            { buffer: 0, byteOffset: 60, byteLength: 48, target: 34962 },
            { buffer: 0, byteOffset: 108, byteLength: 32, target: 34962 },
            { buffer: 0, byteOffset: imgOffset, byteLength: imgBytes.length },
        ],
        buffers: [{ byteLength: paddedBinSize }],
    };

    const jsonStr = JSON.stringify(gltf);
    const jsonPadding = (4 - (jsonStr.length % 4)) % 4;
    const paddedJson = jsonStr + ' '.repeat(jsonPadding);
    const jsonBytes = Buffer.from(paddedJson, 'utf8');

    const totalGlbSize = 12 + 8 + jsonBytes.length + 8 + paddedBinSize;
    const glbBuffer = Buffer.alloc(totalGlbSize);
    
    let glbOffset = 0;
    glbBuffer.writeUInt32LE(0x46546C67, glbOffset); glbOffset += 4; // "glTF"
    glbBuffer.writeUInt32LE(2, glbOffset); glbOffset += 4;          // version
    glbBuffer.writeUInt32LE(totalGlbSize, glbOffset); glbOffset += 4;

    glbBuffer.writeUInt32LE(jsonBytes.length, glbOffset); glbOffset += 4;
    glbBuffer.writeUInt32LE(0x4E4F534A, glbOffset); glbOffset += 4; // "JSON"
    jsonBytes.copy(glbBuffer, glbOffset); glbOffset += jsonBytes.length;

    glbBuffer.writeUInt32LE(paddedBinSize, glbOffset); glbOffset += 4;
    glbBuffer.writeUInt32LE(0x004E4942, glbOffset); glbOffset += 4; // "BIN"
    binBuffer.copy(glbBuffer, glbOffset);

    fs.writeFileSync(outputPath, glbBuffer);
}

const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));

if (files.length === 0) {
    console.log('No icons found in icons/to-glb. Skipping.');
} else {
    files.forEach(convertPngToGlb);
    console.log(`Successfully generated ${files.length} GLB models in SampleData/models/Generated/`);
}
