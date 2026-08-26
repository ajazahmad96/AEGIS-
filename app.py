from flask import Flask, render_template, request, jsonify
from google import genai

app = Flask(__name__)

# Aapki Gemini API Key yahan dalo
API_KEY = "AQ.Ab8RN6IYMosIUqVhjYK5pdrUoqjk94Fk0fJP6QPmw6gJVE1WNg"

# Client initialize karo
client = genai.Client(api_key=API_KEY)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/ask', methods=['POST'])
def ask_gemini():
    try:
        user_message = request.json.get('message', '')
        
        # Latest Gemini 2.5 Flash Model Request
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=user_message
        )
        
        return jsonify({"reply": response.text})
    except Exception as e:
        return jsonify({"reply": f"AEGIS Error: {str(e)}"}), 500

if __name__ == '__main__':
    # Local host server 5000 port par run hoga
    app.run(host='0.0.0.0', port=5000, debug=True)
