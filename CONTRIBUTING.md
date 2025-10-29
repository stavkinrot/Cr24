# Contributing to CRX Generator

Thank you for your interest in contributing! Here are some ways you can help improve CRX Generator.

## How to Contribute

### Reporting Bugs
- Use the issue tracker to report bugs
- Include steps to reproduce the issue
- Provide browser version and extension version
- Include relevant console errors

### Suggesting Features
- Open an issue with your feature suggestion
- Explain the use case and benefits
- Provide examples if possible

### Code Contributions

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test thoroughly
5. Commit with clear messages: `git commit -m "Add feature: ..."`
6. Push to your fork: `git push origin feature/your-feature`
7. Open a pull request

## Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Type check
npx tsc --noEmit
```

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Add types for all functions and variables
- Comment complex logic
- Keep functions small and focused

## Areas for Contribution

### High Priority
- [ ] Improve Chrome API simulation in preview
- [ ] Add syntax highlighting for generated code
- [ ] Support for background/service workers
- [ ] Better error handling and user feedback
- [ ] Add tests

### Medium Priority
- [ ] Export as .zip file (currently exports individual files)
- [ ] Code editor for manual tweaks
- [ ] Extension templates/examples
- [ ] Better responsive design
- [ ] Accessibility improvements

### Low Priority
- [ ] Multiple AI provider support (Anthropic, etc.)
- [ ] Share generated extensions
- [ ] Extension marketplace integration
- [ ] Analytics for generated extensions

## Testing

Before submitting:
1. Test in Chrome (latest version)
2. Test both light and dark modes
3. Test with different extension types
4. Verify chat history persists
5. Check settings save correctly

## Pull Request Process

1. Update README.md if needed
2. Add your changes to the description
3. Ensure code builds without errors
4. Wait for review and address feedback

## Questions?

Open an issue for any questions about contributing!
