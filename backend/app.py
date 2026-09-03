import os
import tempfile
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

from backend.neo4j_connection import check_connectivity as neo4j_check


def create_app():
    load_dotenv()

    app = Flask(__name__)
    app.config["UPLOAD_TEMP_DIR"] = os.getenv("UPLOAD_TEMP_DIR", tempfile.gettempdir())
    CORS(app, origins=["http://localhost:5173", "http://localhost:3000"])

    from backend.routes.scribe import scribe_bp
    from backend.routes.graph import graph_bp
    from backend.routes.chat import chat_bp

    app.register_blueprint(scribe_bp, url_prefix="/api/scribe")
    app.register_blueprint(graph_bp, url_prefix="/api/graph")
    app.register_blueprint(chat_bp, url_prefix="/api/chat")

    @app.route("/api/health")
    def health():
        neo4j_ok = neo4j_check()
        return {
            "status": "ok" if neo4j_ok else "degraded",
            "neo4j": "connected" if neo4j_ok else "disconnected",
        }

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=os.getenv("FLASK_DEBUG", "0") == "1")
