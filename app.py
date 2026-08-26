from flask import Flask, render_template, request, jsonify
import urllib.request
import json

app = Flask(__name__)

# Aapki Gemini API Key
API_KEY = "AQ.Ab8RNSiYMosIUqVhjYK5pdrUoqjk94Fk0fJP6QPmw6gJVE1WNg"

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/ask', methods=['POST'])
def ask_gemini():
    try:
        user_message = request.json.get('message', '')
        
        # System instructions + User message combined for REST API
        prompt_text = f"""
        You are AEGIS, an advanced, highly intelligent, and friendly AI assistant for Mr. Ajaz.
        - Provide structured, clear responses using bold headers and bullet points.
        - Respond in natural Hinglish if asked in Hinglish.
        - Format math equations using LaTeX notation ($ inline $ or $$ display $$).
        
        User: {user_message}
        """

        # Direct Google Gemini API URL for gemini-1.5-flash
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={API_KEY}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt_text}]
            }]
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            reply_text = res_data['candidates'][0]['content']['parts'][0]['text']
            return jsonify({"reply": reply_text})

    except Exception as e:
        return jsonify({"reply": f"AEGIS Error: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
