.PHONY: install uninstall restart status logs build

build: node_modules web/node_modules
	npm run build
	npm run build:web

install: build
	npm link
	vigil start
	@echo "\n✓ Vigil installed and running. Dashboard: http://localhost:7474"
	@echo "  Use: vigil start | stop | status | logs"

uninstall:
	vigil stop
	npm unlink -g vigil
	@echo "\n✓ Vigil stopped and unlinked."

restart: build
	-vigil stop 2>/dev/null
	vigil start
	@echo "\n✓ Vigil restarted."

status:
	@vigil status

logs:
	@vigil logs

node_modules: package.json
	npm install
	@touch node_modules

web/node_modules: web/package.json
	cd web && npm install
	@touch web/node_modules
