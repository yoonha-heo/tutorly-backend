import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilitiesController } from './availabilities.controller';

describe('AvailabilitiesController', () => {
  let controller: AvailabilitiesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvailabilitiesController],
    }).compile();

    controller = module.get<AvailabilitiesController>(AvailabilitiesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
