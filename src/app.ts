// original version
import express from "express";
import cors from "cors";
import passport from "passport";
import session from "express-session";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { expressMiddleware } from "@apollo/server/express4";
import { initDb } from "./db/connection";
import { typeDefs } from "./graphql/schemas/schemas";
import { resolvers } from "./graphql/resolvers/resolvers";
import { buildContext } from "graphql-passport";
import "./oauth/google";

const port = process.env.PORT || 3000;
const app = express();
let server: ApolloServer;

async function startServer() {
    server = new ApolloServer({
        typeDefs,
        resolvers,
        plugins: [ApolloServerPluginLandingPageLocalDefault()],
        introspection: true,
    });

    // Middleware to handle URL encoding
    app.use(express.urlencoded({ extended: true }));

    // Middleware to redirect to the trailing slash version of the URL
    app.use((req, res, next) => {
        if (!req.originalUrl.endsWith("/")) {
            res.redirect(301, req.originalUrl + "/");
        } else {
            next();
        }
    });

    app.use(
        session({
            secret: process.env.SECRET as string,
            resave: false,
            saveUninitialized: false,// Use the MongoStore for session storage
        })
    );
    app.use(passport.initialize());
    app.use(passport.session());
    await server.start();
    app.use("/graphql", (req, res, next) => {
        if (!req.isAuthenticated()) {
          return res.redirect("/login?message=Please log in to access the GraphQL API.");
        } else {
          next();
        }
    });
    app.use(
        "/graphql",
        cors(),
        express.json(),
        expressMiddleware(server, {
            context: async ({ req, res }) => buildContext({ req, res }),
        })
    );

    // Custom welcome message for the root URL
    app.get("/", (req, res) => {
        if (req.isAuthenticated()) {
            res.send(req.user + ', Welcome to the Asset Tracking API.');
        } else {
            res.send('Welcome to the Asset Tracking API. Please login.');
        }
    });
    app.get("/login", passport.authenticate("google", { scope: ["profile"] }));
    app.get(
        "/auth/google/callback",
        passport.authenticate("google", { failureRedirect: "/login" }),
        (req, res) => res.redirect("/graphql")
    );
    app.get("/logout", (req, res) => {
        req.logout(() => res.redirect("/graphql"));
    });

    initDb((err: Error | null) => {
        if (err) {
            console.error(err);
        } else {
            app.listen(port);
            console.log(`Web Server is listening at http://localhost:${port}/graphql`);
            return server;
        }
    });
}

startServer().catch((error) => {
    console.error("Error starting the server:", error);
});

export { server };