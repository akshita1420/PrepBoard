# Build the Spring Boot jar, then run it on a small Java 21 runtime.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package && cp target/*.jar app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/app.jar app.jar
EXPOSE 8080
# Settings come from environment variables (see .env.example at the repo root).
ENTRYPOINT ["java", "-jar", "app.jar"]
