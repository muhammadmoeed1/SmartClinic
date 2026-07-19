import { KnowledgeService } from '../src/knowledge/knowledge.service';
import { EmbeddingService } from '../src/embedding/embedding.service';

describe('KnowledgeService', () => {
  const embeddings = { embed: jest.fn() } as unknown as jest.Mocked<EmbeddingService>;
  const dataSource = { query: jest.fn() } as any;
  let service: KnowledgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KnowledgeService(embeddings, dataSource);
  });

  it('returns [] without querying the database when embedding is unavailable', async () => {
    (embeddings.embed as jest.Mock).mockResolvedValue(null);
    const result = await service.searchKnowledge('chest pain');
    expect(result).toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('embeds the query and runs a cosine-distance search, optionally filtered by category', async () => {
    (embeddings.embed as jest.Mock).mockResolvedValue([0.1, 0.2, 0.3]);
    dataSource.query.mockResolvedValue([{ id: '1', title: 't', content: 'c', category: 'triage', specialty: null, score: 0.9 }]);

    const result = await service.searchKnowledge('chest pain', 2, 'triage');

    expect(result).toHaveLength(1);
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('embedding <=> $1::vector');
    expect(sql).toContain('category = $2');
    expect(params).toEqual(['[0.1,0.2,0.3]', 'triage', 2]);
  });

  it('searchPatientHistory scopes the query to the given patient and excludes empty assessments', async () => {
    (embeddings.embed as jest.Mock).mockResolvedValue([0.5, 0.5]);
    dataSource.query.mockResolvedValue([]);

    await service.searchPatientHistory('patient-1', 'back pain', 3);

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('"patientId" = $2');
    expect(sql).toContain("assessment <> ''");
    expect(params).toEqual(['[0.5,0.5]', 'patient-1', 3]);
  });
});
