## AI Model Selection

The generator now supports an "Auto / Best" option in the model selector. When selected, the frontend automatically chooses the highest-priority available model in this order:

1. gpt-5
2. gpt-4.1
3. gpt-4o
4. gpt-4o-mini

You can also manually select any listed model. The selected model is sent to the backend for all AI operations.