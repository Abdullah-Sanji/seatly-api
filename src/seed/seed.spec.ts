import { seed } from './seed';

type PrismaStub = {
  event: { count: jest.Mock; create: jest.Mock };
};

function makePrisma(existingEvents: number): PrismaStub {
  return {
    event: {
      count: jest.fn().mockResolvedValue(existingEvents),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'evt', ...data })),
    },
  };
}

describe('seed', () => {
  it('skips when events already exist', async () => {
    const prisma = makePrisma(3);
    // Cast: the seed only touches prisma.event.count/create, so a stub is enough.
    const result = await seed(prisma as never);
    expect(result.created).toBe(false);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('creates three events with 50 seats each on an empty database', async () => {
    const prisma = makePrisma(0);
    const result = await seed(prisma as never);
    expect(result.created).toBe(true);
    expect(prisma.event.create).toHaveBeenCalledTimes(3);
    const statuses = prisma.event.create.mock.calls.map(([arg]) => arg.data.status).sort();
    expect(statuses).toEqual(['closed', 'on_sale', 'upcoming']);
    for (const [arg] of prisma.event.create.mock.calls) {
      expect(arg.data.seats.create).toHaveLength(50);
    }
  });
});
