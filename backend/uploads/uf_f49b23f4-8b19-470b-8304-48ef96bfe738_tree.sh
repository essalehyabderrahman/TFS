echo -e "This is the architecture of the project:\n" > tree.txt
tree -L 5 --dirsfirst -I "node_modules|venv|__pycache__|*.pyc|*.tsbuildinfo" >> tree.txt