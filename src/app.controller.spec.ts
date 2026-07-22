import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './common/prisma/prisma.service';

jest.mock('./common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('AppController', () => {
  let appController: AppController;
  let prismaService: Pick<PrismaService, '$queryRaw'>;

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as Pick<PrismaService, '$queryRaw'>;

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return API and database health', async () => {
      const result = await appController.getHealth();

      expect(prismaService.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('ok');
      expect(result.database).toBe('connected');
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});
