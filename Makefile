.PHONY: lint
lint:
	black .
	pyflakes .
	python3.11 -m mypy -p server


.PHONY: test
test: lint
	pytest . -vv


.PHONY: run-client
run-client:
	python3.11 -m http.server 8000


.PHONY: run-server
run-server: lint
	python3.11 -m server.app