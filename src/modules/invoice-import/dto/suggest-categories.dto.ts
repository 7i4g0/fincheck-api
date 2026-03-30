import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class SuggestCategoriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  names: string[];
}
