import { RuleEngine, runRuleSet } from '@/rule-engine/core/rule-engine';
import {
  DataValueNotFoundError,
  MissingKeyError,
  OPERATION,
  OperationNotFoundError,
  OPERATOR,
  RuleResultSet,
  RuleSet,
  RuleResult,
} from '@ballerine/common';
import { context } from './data-helper';
import z from 'zod';

const mockData = {
  country: 'US',
  name: 'John',
  age: 35,
};

describe('Rule Engine', () => {
  it('should validate a simple rule set', () => {
    const ruleSetExample: RuleSet = {
      operator: OPERATOR.OR,
      rules: [
        {
          key: 'country',
          operation: OPERATION.EQUALS,
          value: 'US',
        },
        {
          operator: OPERATOR.AND,
          rules: [
            {
              key: 'name',
              operation: OPERATION.EQUALS,
              value: 'John',
            },
            {
              operator: OPERATOR.OR,
              rules: [
                {
                  key: 'age',
                  operation: OPERATION.GT,
                  value: 40,
                },
                {
                  key: 'age',
                  operation: OPERATION.LTE,
                  value: 35,
                },
              ],
            },
          ],
        },
      ],
    };

    const validationResults: RuleResultSet = runRuleSet(ruleSetExample, mockData);

    expect(validationResults).toBeDefined();
    expect(validationResults).toHaveLength(2);

    expect(validationResults[0]!.status).toBe('PASSED');

    expect(validationResults[1]!.status).toBe('PASSED');
  });

  it('should handle missing key in rule', () => {
    const ruleSetExample: RuleSet = {
      operator: OPERATOR.OR,
      rules: [
        {
          key: 'nonexistent',
          operation: OPERATION.EQUALS,
          value: 'US',
        },
      ],
    };

    const validationResults: RuleResultSet = runRuleSet(ruleSetExample, mockData);
    expect(validationResults[0]!.status).toBe('FAILED');
    expect((validationResults[0] as RuleResult).message).toBe(
      'Field nonexistent is missing or null',
    );
    expect((validationResults[0] as RuleResult).error).toBeInstanceOf(DataValueNotFoundError);
  });

  it('should throw an error for unknown operation', () => {
    const ruleSetExample: RuleSet = {
      operator: OPERATOR.OR,
      rules: [
        {
          key: 'country',
          // @ts-ignore - intentionally using an unknown operation
          operation: 'UNKNOWN',
          value: 'US',
        },
      ],
    };

    const result = runRuleSet(ruleSetExample, mockData);
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      error: expect.any(OperationNotFoundError),
      message: 'Unknown operation UNKNOWN',
      rule: {
        key: 'country',
        operation: 'UNKNOWN',
        value: 'US',
      },
      status: 'FAILED',
    });
  });

  it('should fail for incorrect value', () => {
    const ruleSetExample: RuleSet = {
      operator: OPERATOR.OR,
      rules: [
        {
          key: 'country',
          operation: OPERATION.EQUALS,
          value: 'CA',
        },
      ],
    };

    const validationResults: RuleResultSet = runRuleSet(ruleSetExample, mockData);
    expect(validationResults[0]!.status).toBe('FAILED');
    expect((validationResults[0] as RuleResult).error).toBe(undefined);
  });

  it.skip('should validate custom operation with additional params', () => {
    // TODO: should spy Date.now() to return a fixed date
    const ruleSetExample: RuleSet = {
      operator: OPERATOR.AND,
      rules: [
        {
          key: 'createdAt',
          operation: OPERATION.LAST_YEAR,
          value: { years: 2 },
        },
      ],
    };

    const validationResults: RuleResultSet = runRuleSet(ruleSetExample, mockData);
    expect(validationResults[0]!.status).toBe('PASSED');
  });

  it('should fail custom operation with missing additional params', () => {
    const ruleSetExample: RuleSet = {
      operator: OPERATOR.OR,
      rules: [
        {
          key: 'age',
          operation: OPERATION.LAST_YEAR,
          value: { years: 'two' }, // Invalid type for years
        },
      ],
    };

    const validationResults: RuleResultSet = runRuleSet(ruleSetExample, mockData);
    expect(validationResults[0]!.status).toBe('FAILED');
    expect((validationResults[0] as RuleResult).message).toContain(
      `Validation failed for 'LAST_YEAR', message: Invalid condition value`,
    );
  });

  it('should throw MissingKeyError when rule is missing key field', () => {
    const ruleSetExample: RuleSet = {
      operator: OPERATOR.OR,
      rules: [
        {
          key: '',
          operation: OPERATION.EQUALS,
          value: 'US',
        },
      ],
    };

    const result = runRuleSet(ruleSetExample, mockData);
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      error: expect.any(MissingKeyError),
      message: 'Rule is missing the key field',
      rule: {
        key: '',
        operation: 'EQUALS',
        value: 'US',
      },
      status: 'FAILED',
    });
  });

  it('should resolve a nested property from context', () => {
    const ruleSetExample: RuleSet = {
      operator: OPERATOR.AND,
      rules: [
        {
          key: 'pluginsOutput.businessInformation.data[0].establishDate',
          operation: OPERATION.LAST_YEAR,
          value: { years: 1 },
        },
      ],
    };

    const engine = RuleEngine(ruleSetExample);
    let result = engine.run(context);

    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "rule": {
          "key": "pluginsOutput.businessInformation.data[0].establishDate",
          "operation": "LAST_YEAR",
          "value": {
            "years": 1,
          },
        },
        "status": "PASSED",
      }
    `);

    const context2 = JSON.parse(JSON.stringify(context));

    // @ts-ignore
    context2.pluginsOutput.businessInformation.data[0].establishDate = '2020-01-01';

    result = engine.run(context2 as any);
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "rule": {
          "key": "pluginsOutput.businessInformation.data[0].establishDate",
          "operation": "LAST_YEAR",
          "value": {
            "years": 1,
          },
        },
        "status": "FAILED",
      }
    `);
  });

  describe('exists operation', () => {
    it('should resolve a nested property from context', () => {
      const ruleSetExample: RuleSet = {
        operator: OPERATOR.AND,
        rules: [
          {
            key: 'pluginsOutput.businessInformation.data[0].shares',
            operation: OPERATION.EXISTS,
            value: {},
          },
        ],
      };

      const engine = RuleEngine(ruleSetExample);
      let result = engine.run(context);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "pluginsOutput.businessInformation.data[0].shares",
            "operation": "EXISTS",
            "value": {},
          },
          "status": "PASSED",
        }
      `);

      const context2 = JSON.parse(JSON.stringify(context));

      // @ts-ignore
      context2.pluginsOutput.businessInformation.data[0].shares = [];

      result = engine.run(context2 as any);
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "pluginsOutput.businessInformation.data[0].shares",
            "operation": "EXISTS",
            "value": {},
          },
          "status": "FAILED",
        }
      `);

      // @ts-ignore
      context2.pluginsOutput.businessInformation.data[0].shares = {};

      result = engine.run(context2 as any);
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "pluginsOutput.businessInformation.data[0].shares",
            "operation": "EXISTS",
            "value": {},
          },
          "status": "FAILED",
        }
      `);

      // @ts-ignore
      context2.pluginsOutput.businessInformation.data[0].shares = { item: 1 };

      result = engine.run(context2 as any);
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "pluginsOutput.businessInformation.data[0].shares",
            "operation": "EXISTS",
            "value": {},
          },
          "status": "PASSED",
        }
      `);
    });

    it('should check with schema', () => {
      const ruleSetExample: RuleSet = {
        operator: OPERATOR.AND,
        rules: [
          {
            key: 'pluginsOutput.businessInformation.data[0].shares',
            operation: OPERATION.EXISTS,
            value: {
              schema: z.object({
                item: z.coerce.number().int().positive(),
              }),
            },
          },
        ],
      };

      const context2 = JSON.parse(JSON.stringify(context));

      const engine = RuleEngine(ruleSetExample);

      let result = engine.run(context2 as any);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('FAILED');

      // @ts-ignore
      context2.pluginsOutput.businessInformation.data[0].shares = { item: 1 };

      result = engine.run(context2 as any);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('PASSED');

      // @ts-ignore
      context2.pluginsOutput.businessInformation.data[0].shares = {};

      result = engine.run(context2 as any);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]?.error).toMatchInlineSnapshot(`undefined`);
      expect(result[0]?.status).toBe('FAILED');
    });
  });

  describe('not_equals operation', () => {
    it('should resolve a nested property from context', () => {
      const ruleSetExample: RuleSet = {
        operator: OPERATOR.AND,
        rules: [
          {
            key: 'pluginsOutput.companySanctions.data.length',
            operation: OPERATION.NOT_EQUALS,
            value: 0,
          },
        ],
      };

      const engine = RuleEngine(ruleSetExample);
      let result = engine.run(context);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "pluginsOutput.companySanctions.data.length",
            "operation": "NOT_EQUALS",
            "value": 0,
          },
          "status": "PASSED",
        }
      `);

      const context2 = JSON.parse(JSON.stringify(context));

      // @ts-ignore
      context2.pluginsOutput.companySanctions.data = [];

      result = engine.run(context2 as any);
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "pluginsOutput.companySanctions.data.length",
            "operation": "NOT_EQUALS",
            "value": 0,
          },
          "status": "FAILED",
        }
      `);
    });
  });

  describe('in operation', () => {
    it('should resolve a nested property from context', () => {
      const ruleSetExample: RuleSet = {
        operator: OPERATOR.AND,
        rules: [
          {
            key: 'entity.data.country',
            operation: OPERATION.IN,
            value: ['IL', 'AF', 'US', 'GB'],
          },
        ],
      };

      const engine = RuleEngine(ruleSetExample);
      let result = engine.run(context);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "entity.data.country",
            "operation": "IN",
            "value": [
              "IL",
              "AF",
              "US",
              "GB",
            ],
          },
          "status": "PASSED",
        }
      `);

      const context2 = JSON.parse(JSON.stringify(context));

      // @ts-ignore
      context2.entity.data.country = 'CA';

      result = engine.run(context2 as any);
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "entity.data.country",
            "operation": "IN",
            "value": [
              "IL",
              "AF",
              "US",
              "GB",
            ],
          },
          "status": "FAILED",
        }
      `);
    });
  });

  describe('not_in operation', () => {
    it('should resolve a nested property from context', () => {
      const ruleSetExample: RuleSet = {
        operator: OPERATOR.AND,
        rules: [
          {
            key: 'entity.data.country',
            operation: OPERATION.NOT_IN,
            value: ['IL', 'CA', 'US', 'GB'],
          },
        ],
      };

      const engine = RuleEngine(ruleSetExample);
      let result = engine.run(context);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "entity.data.country",
            "operation": "NOT_IN",
            "value": [
              "IL",
              "CA",
              "US",
              "GB",
            ],
          },
          "status": "PASSED",
        }
      `);

      const context2 = JSON.parse(JSON.stringify(context));

      // @ts-ignore
      context2.entity.data.country = 'CA';

      result = engine.run(context2 as any);
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchInlineSnapshot(`
        {
          "error": undefined,
          "rule": {
            "key": "entity.data.country",
            "operation": "NOT_IN",
            "value": [
              "IL",
              "CA",
              "US",
              "GB",
            ],
          },
          "status": "FAILED",
        }
      `);
    });
  });
});