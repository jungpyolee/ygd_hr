import "@testing-library/jest-dom";

// URL.createObjectURL / revokeObjectURL are not in jsdom
global.URL.createObjectURL = () => "blob:mock-url";
global.URL.revokeObjectURL = () => {};

// crypto.randomUUID
Object.defineProperty(global, "crypto", {
  value: { randomUUID: () => "mock-uuid-1234" },
});
