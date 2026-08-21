"""MediGraph AI -- Flask application factory."""
from __future__ import annotations

from flask import Flask, jsonify
from flask_cors import CORS

from config import FLASK_HOST, FLASK_PORT
from routes.admin import bp as admin_bp
from routes.dashboard import bp as dashboard_bp
from routes.diseases import bp as diseases_bp
from routes.graph import bp as graph_bp
from routes.hospitals import bp as hospitals_bp
from routes.medicines import bp as medicines_bp
from routes.patients import bp as patients_bp
from routes.search import bp as search_bp, chat_bp
from routes.supply_chain import bp as supply_chain_bp
from services.graph_service import GraphConnectionError


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    for blueprint in (
        dashboard_bp, patients_bp, diseases_bp, medicines_bp, hospitals_bp,
        supply_chain_bp, graph_bp, search_bp, chat_bp, admin_bp,
    ):
        # Nest each blueprint's own prefix under /api (passing a bare
        # url_prefix here would REPLACE the blueprint's own).
        app.register_blueprint(blueprint, url_prefix=f"/api{blueprint.url_prefix or ''}")

    @app.get("/api/health")
    def health():
        try:
            from services.graph_service import get_driver
            get_driver().verify_connectivity()
            return jsonify({"data": {"status": "ok", "neo4j": "connected"}, "error": None})
        except GraphConnectionError:
            return jsonify({"data": {"status": "degraded", "neo4j": "unreachable"}, "error": None}), 503

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"data": None, "error": "Endpoint not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(_):
        return jsonify({"data": None, "error": "Method not allowed"}), 405

    @app.errorhandler(GraphConnectionError)
    def neo4j_down(exc):
        return jsonify({"data": None, "error": str(exc)}), 503

    @app.errorhandler(Exception)
    def internal_error(exc):
        if hasattr(exc, "code") and isinstance(exc.code, int) and 400 <= exc.code < 500:
            return jsonify({"data": None, "error": str(exc)}), exc.code
        app.logger.exception("Unhandled error")
        return jsonify({"data": None, "error": "Internal server error"}), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=True)
