export function toClientPlugin(schema) {
  schema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (_, ret) => {
      // Normalize Mongo's _id to plain id to keep API payloads stable.
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    }
  });
}

