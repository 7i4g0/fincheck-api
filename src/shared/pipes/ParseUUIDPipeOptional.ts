import { ArgumentMetadata, ParseUUIDPipe } from '@nestjs/common';

export class ParseUUIDPipeOptional extends ParseUUIDPipe {
  transform(value: string, metadata: ArgumentMetadata) {
    if (typeof value === 'undefined') {
      return undefined;
    }

    return super.transform(value, metadata);
  }
}
