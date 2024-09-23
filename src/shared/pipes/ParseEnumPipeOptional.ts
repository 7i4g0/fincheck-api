import { ArgumentMetadata, ParseEnumPipe } from '@nestjs/common';

export class ParseEnumPipeOptional<T = any> extends ParseEnumPipe {
  transform(value: T, metadata: ArgumentMetadata) {
    if (typeof value === 'undefined') {
      return undefined;
    }

    return super.transform(value, metadata);
  }
}
