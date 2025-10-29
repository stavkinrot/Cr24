# Example Extension Prompts

Here are some example prompts you can use with CRX Generator to create different types of extensions.

## Simple Popup Extensions

### Word Counter
```
Create a word counter extension with a popup that shows:
- Total word count on the current page
- Total character count
- A clean, simple UI with the counts displayed prominently
```

### Color Picker
```
Create a color picker extension that:
- Has a popup with an eyedropper tool
- Shows the hex code of clicked colors
- Displays a history of picked colors
- Has a copy-to-clipboard button
```

### Quick Notes
```
Build a quick notes extension with:
- A popup textarea for taking notes
- Auto-save functionality
- Clean, minimal design
- Dark mode support
```

### Timer/Pomodoro
```
Create a Pomodoro timer extension with:
- 25-minute work timer and 5-minute break timer
- Start, pause, and reset buttons
- Desktop notifications when timer completes
- Clean, modern UI
```

## Content Script Extensions

### Link Highlighter
```
Create an extension that highlights all links on a webpage in yellow.
Make sure it:
- Adds a yellow background to all <a> tags
- Works on any webpage
- Can be toggled on/off via a popup button
```

### Reading Mode
```
Build a reading mode extension that:
- Removes ads and sidebars from articles
- Centers the main content
- Adjusts font size and line height for readability
- Can be toggled via browser action
```

### Dark Mode Toggle
```
Create a universal dark mode extension that:
- Inverts colors on any webpage
- Has smooth transitions
- Can be toggled with a popup button
- Persists the setting per domain
```

### Image Downloader
```
Build an extension that:
- Adds "Download" buttons to all images on a page
- Lets users click to download any image
- Shows image dimensions on hover
```

## Productivity Extensions

### Tab Manager
```
Create a tab manager extension with:
- List of all open tabs in a popup
- Search/filter functionality
- Quick close buttons for each tab
- Group tabs by domain
```

### Focus Mode
```
Build a focus mode extension that:
- Blocks distracting websites (user-configurable list)
- Shows a motivational message when blocked sites are accessed
- Has a timer to enable/disable blocking
- Simple on/off toggle
```

### Screenshot Tool
```
Create a screenshot extension that:
- Captures the visible area of the current tab
- Has a download button
- Simple one-click operation
```

## Fun Extensions

### Random Quote Generator
```
Build a random quote generator extension with:
- A popup showing an inspirational quote
- A "Next Quote" button
- Clean, card-style design
- Smooth transitions between quotes
```

### Cat Facts
```
Create a cat facts extension that:
- Shows a random cat fact in the popup
- Has a "New Fact" button
- Displays a cat emoji
- Uses a fun, playful design
```

### Dice Roller
```
Build a dice roller extension with:
- Buttons for D6, D12, D20
- Animated roll effect
- Shows the result prominently
- Clean, game-inspired design
```

## Tips for Better Results

### Be Specific
Instead of: "Create a todo list"
Try: "Create a todo list extension with add/remove buttons, checkboxes to mark complete, and persistent storage"

### Include Design Details
Instead of: "Make it look nice"
Try: "Use a card-based design with rounded corners, a blue accent color (#0066cc), and smooth animations"

### Specify Functionality
Instead of: "Make it work on all pages"
Try: "Use a content script that runs on all URLs and injects a button in the top-right corner"

### Request Features Explicitly
- Mention if you need storage/persistence
- Specify popup vs content script
- Request specific UI elements
- Ask for error handling

## Example Conversation

**You**: Create a simple password generator extension

**AI**: [Generates basic extension]

**You**: Add options to control password length and include/exclude symbols

**AI**: [Updates with settings]

**You**: Make the design more modern with a gradient background

**AI**: [Updates styling]

## Common Patterns

### Popup with Storage
```
Create a [type] extension with a popup that:
- [Main functionality]
- Saves data using chrome.storage.local
- Has a clean UI with [design details]
```

### Content Script Injector
```
Create an extension that injects [element] into every webpage:
- Position it at [location]
- Style it with [design details]
- Make it [behavior]
```

### Combined Popup + Content Script
```
Build an extension with:
- A popup to configure [settings]
- A content script that [does something] based on those settings
- Communication between popup and content script
```

Happy extension building!
