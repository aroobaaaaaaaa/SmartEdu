# test_ollama.py
# This is a throwaway test file — we'll delete it after confirming things work

import ollama

def test_ollama():
    print("Sending message to Mistral...")
    
    # This sends a message to Ollama running on your computer
    # Ollama must be running (you installed it earlier — it runs as a background service)
    response = ollama.chat(
        model="mistral",    # The model name you pulled earlier
        messages=[
            {
                "role": "user",          # This message is from the user
                "content": "Say hello and tell me you are working correctly. Be brief."
            }
        ]
    )
    
    # response is a Python dictionary with the model's reply
    print("Model response:")
    print(response["message"]["content"])

test_ollama()