from flask import Flask, render_template, request, jsonify
from google import genai

app = Flask(__name__)

# Aapki Gemini API Key
API_KEY = "AQ.Ab8RNSiYMosIUqVhjYK5pdrUoqjk94Fk0fJP6QPmw6gJVE1WNg"

# Client initialize karo
client = genai.Client(api_key=API_KEY)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/ask', methods=['POST'])
def ask_gemini():
    try:
        user_message = request.json.get('message', '')
        
        # AEGIS Professional System Instruction
        system_instruction = """
        You are AEGIS, an advanced, highly intelligent, and friendly AI assistant.
        Your goal is to provide exceptionally clear, accurate, and beautifully formatted responses like ChatGPT and Google Gemini.

        Follow these strict output guidelines:
        1. Formatting: Always structure complex explanations using bold headers, clean bullet points, and code blocks.
        2. Tone: Maintain a warm, encouraging, smart, and professional tone.
        3. Language Adaptation: If the user asks in Hinglish or Hindi, respond fluently in natural Hinglish with clear English terms for technical concepts. Call the user Mr. Ajaz.
        4. Math & Science: Always format equations cleanly using LaTeX notation ($ inline $ or $$ display $$).
        5. Conciseness: Direct, impactful, and structured answers only.
        """

        # Latest Gemini 3.6 Flash Model Request with System Instructions
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=user_message,
            config={
                'system_instruction': system_instruction,
                'temperature': 0.7
            }
        )

        return jsonify({"reply": response.text})

    except Exception as e:
        return jsonify({"reply": f"AEGIS Error: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
