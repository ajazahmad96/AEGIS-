from flask import Flask, render_template, request, jsonify
import google.generativeai as genai

app = Flask(__name__)

# Aapki Gemini API Key
API_KEY = "AQ.Ab8RNSiYMosIUqVhjYK5pdrUoqjk94Fk0fJP6QPmw6gJVE1WNg"

# Configure standard GenAI library
genai.configure(api_key=API_KEY)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/ask', methods=['POST'])
def ask_gemini():
    try:
        user_message = request.json.get('message', '')
        
        # System Instructions + Persona Prompt combined for stable model
        prompt = f"""
        You are AEGIS, an advanced, highly intelligent, and friendly AI assistant.
        Provide exceptionally clear, accurate, and beautifully formatted responses like ChatGPT and Google Gemini.
        - Structure responses using bold headers, clean bullet points, and code blocks.
        - Respond in natural Hinglish if asked in Hinglish/Hindi, and call the user Mr. Ajaz.
        - Format math equations using LaTeX notation ($ inline $ or $$ display $$).
        
        User Question: {user_message}
        """

        # Stable model call using standard library
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)

        return jsonify({"reply": response.text})

    except Exception as e:
        return jsonify({"reply": f"AEGIS Error: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
