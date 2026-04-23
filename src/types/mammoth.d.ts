/**
 * Minimal ambient type declaration for `mammoth` — the npm package doesn't
 * ship types, and there's no `@types/mammoth` on DefinitelyTyped. Declare
 * only the surface we actually use (convertToHtml + images.imgElement).
 */
declare module "mammoth" {
  export interface MammothImage {
    read(encoding: "base64"): Promise<string>;
    readonly contentType: string | undefined;
  }

  export interface MammothConversionResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export type MammothImageTransform = (
    image: MammothImage,
  ) => Promise<{ src: string }>;

  export interface MammothOptions {
    convertImage?: MammothImageTransform;
  }

  export interface MammothInput {
    arrayBuffer: ArrayBuffer;
  }

  export function convertToHtml(
    input: MammothInput,
    options?: MammothOptions,
  ): Promise<MammothConversionResult>;

  export const images: {
    imgElement(transform: MammothImageTransform): MammothImageTransform;
  };
}
