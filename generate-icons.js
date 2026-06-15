import sharp from 'sharp';

const svgIcon = `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#09090b" rx="100" />
  <path d="M256 128C185.3 128 128 185.3 128 256s57.3 128 128 128 128-57.3 128-128-57.3-128-128-128zm0 213.3c-47.1 0-85.3-38.2-85.3-85.3s38.2-85.3 85.3-85.3 85.3 38.2 85.3 85.3-38.2 85.3-85.3 85.3z" fill="#ffffff" opacity="0.8" />
  <circle cx="256" cy="256" r="42.7" fill="#ffffff" />
</svg>
`;

async function main() {
  await sharp(Buffer.from(svgIcon))
    .resize(192, 192)
    .png()
    .toFile('public/icon-192.png');
  
  await sharp(Buffer.from(svgIcon))
    .resize(512, 512)
    .png()
    .toFile('public/icon-512.png');
    
  console.log('Icons generated successfully!');
}

main().catch(console.error);
