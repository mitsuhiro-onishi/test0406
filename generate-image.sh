#!/bin/bash
# Gemini API Image Generation Script
# Usage: ./generate-image.sh "your prompt here" [output_filename]

API_KEY="AIzaSyACKV3mGQLr0FchRlArHPE00-yfaqLhQWg"
MODEL="gemini-2.0-flash-exp"
PROMPT="${1:-A cute cat sitting on a windowsill}"
OUTPUT="${2:-generated_image.png}"

if [ -z "$1" ]; then
  echo "Usage: ./generate-image.sh \"prompt\" [output_filename.png]"
  echo "Example: ./generate-image.sh \"A sunset over the ocean\" sunset.png"
  exit 1
fi

echo "Generating image: \"$PROMPT\""
echo "Output: $OUTPUT"

RESPONSE=$(curl -s "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{
      \"parts\": [{
        \"text\": \"Generate an image: ${PROMPT}\"
      }]
    }],
    \"generationConfig\": {
      \"responseModalities\": [\"TEXT\", \"IMAGE\"]
    }
  }")

# Check for errors
ERROR=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if 'error' in d:
        print(d['error'].get('message', 'Unknown error'))
    elif 'candidates' not in d:
        print('No candidates in response')
except:
    print('Failed to parse response')
" 2>/dev/null)

if [ "$ERROR" = "Failed to parse response" ] || [ "$ERROR" = "No candidates in response" ]; then
  echo "Error: $ERROR"
  echo "Raw response (first 500 chars):"
  echo "$RESPONSE" | head -c 500
  exit 1
fi

# Extract and save image
python3 -c "
import sys, json, base64
data = json.loads('''$RESPONSE''') if len('''$RESPONSE''') < 100000 else None
if data is None:
    with open('/tmp/gemini_response.json', 'r') as f:
        data = json.load(f)
parts = data['candidates'][0]['content']['parts']
saved = False
for part in parts:
    if 'inlineData' in part:
        img_data = base64.b64decode(part['inlineData']['data'])
        with open('$OUTPUT', 'wb') as f:
            f.write(img_data)
        print(f'Image saved to $OUTPUT ({len(img_data)} bytes)')
        saved = True
    elif 'text' in part:
        print(f'Model response: {part[\"text\"]}')
if not saved:
    print('No image data found in response')
" 2>/dev/null

# Fallback: save response and parse with file
if [ $? -ne 0 ]; then
  echo "$RESPONSE" > /tmp/gemini_response.json
  python3 -c "
import json, base64
with open('/tmp/gemini_response.json', 'r') as f:
    data = json.load(f)
if 'error' in data:
    print(f'API Error: {data[\"error\"][\"message\"]}')
else:
    parts = data['candidates'][0]['content']['parts']
    for part in parts:
        if 'inlineData' in part:
            img_data = base64.b64decode(part['inlineData']['data'])
            with open('$OUTPUT', 'wb') as f:
                f.write(img_data)
            print(f'Image saved to $OUTPUT ({len(img_data)} bytes)')
        elif 'text' in part:
            print(f'Model response: {part[\"text\"]}')
"
fi
