import { defineConfig } from "vite";
export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "ethereum", test: /node_modules[\\/](ethers|@noble|@adraffy)[\\/]/ },
          ],
        },
      },
    },
  },
});
