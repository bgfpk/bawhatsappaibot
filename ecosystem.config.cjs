module.exports = {
  apps: [
    {
      name: "blackarrow",
      cwd: __dirname,
      script: "dist/server.cjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
