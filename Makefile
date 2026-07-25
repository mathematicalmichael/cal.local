PORT ?= 8080

.PHONY: run serve clean

run: serve

# Serve the static site locally. Prefers `bunx serve` if bun is installed,
# falls back to python3's stdlib http.server (no deps needed either way —
# this project has no build step).
serve:
	@if command -v bun >/dev/null 2>&1; then \
		echo "Serving with bun on http://localhost:$(PORT)"; \
		bunx serve -l $(PORT) .; \
	else \
		echo "bun not found, serving with python3 on http://localhost:$(PORT)"; \
		python3 -m http.server $(PORT); \
	fi

clean:
	@echo "Nothing to clean — this is a static, buildless site."
