# Icons

This folder contains the extension icons.

## Generating PNG Icons

You can use the `icon.svg` file to generate PNG icons at different sizes:

### Using an online tool:
1. Go to https://svgtopng.com/ or similar
2. Upload `icon.svg`
3. Generate at sizes: 16x16, 48x48, and 128x128
4. Save as `icon16.png`, `icon48.png`, and `icon128.png`

### Using ImageMagick (if installed):
```bash
convert -background none icon.svg -resize 16x16 icon16.png
convert -background none icon.svg -resize 48x48 icon48.png
convert -background none icon.svg -resize 128x128 icon128.png
```

### Using Inkscape (if installed):
```bash
inkscape icon.svg --export-filename=icon16.png --export-width=16 --export-height=16
inkscape icon.svg --export-filename=icon48.png --export-width=48 --export-height=48
inkscape icon.svg --export-filename=icon128.png --export-width=128 --export-height=128
```

## Temporary Icons

For now, you can use placeholder PNGs or just the SVG until you generate proper PNG files.
