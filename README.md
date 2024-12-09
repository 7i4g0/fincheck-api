# fincheck

Application of financial management in Javascript for study purposes

___

## Docker is required to run the application.
If you already have the database running, you can skip this step and only run  `docker start pg`.

If is the first time you run the application, you need to create the database:
```bash
docker run --name pg -e POSTGRES_USER=username -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
```
Create a database named `fincheck` and run the migrations.
```bash
# Open the container terminal
docker exec -it pg bash

# Login
psql -U root

# List databases
\l

# Create database
CREATE DATABASE fincheck;

# Connect to database
\c fincheck

# List tables
\dt

# Exit
\q
```

- Remember to create a .env file with the correct environment variables.
- Remember to run the migrations before running the application.

## Run the migrations

```bash
npx prisma migrate dev
```

## Run the application with hot reload

```bash
npm run start:dev
```

## Run the tests

```bash
npm run test
```

