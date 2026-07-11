.PHONY: install uninstall restart status logs build test check

build: node_modules
	npm run build

test: node_modules
	npm run test

check: build

install: build
	npm link
	vigil start
	@echo "\n✓ Vigil installed and running. API: http://localhost:7474/api (clients: helm + extension)"
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
