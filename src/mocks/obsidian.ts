// The `obsidian` package ships types only, with no runtime entry, so tests
// alias it here. Only the values this module actually constructs are needed;
// everything else it imports is a type and erases at compile time.
export class Notice {
  constructor(public message: string) {}
}
