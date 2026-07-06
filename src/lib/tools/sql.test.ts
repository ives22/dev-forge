import { describe, expect, it } from "vitest";
import { defaultSqlOptions, evaluateSql, formatSql, inspectSql } from "./sql";

const mysqlCreateTableSql = `CREATE TABLE \`orders\` (
  \`id\` bigint NOT NULL AUTO_INCREMENT,
  \`order_no\` varchar(64) NOT NULL,
  \`user_id\` varchar(64) NOT NULL,
  \`amount\` decimal(18,2) NOT NULL DEFAULT '0.00',
  \`status\` varchar(32) NOT NULL DEFAULT 'created',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_order_no\` (\`order_no\`),
  KEY \`idx_user_status\` (\`user_id\`,\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

describe("SQL formatter", () => {
  it("formats select fields and major clauses", () => {
    const output = formatSql("select id,email,count(*) as total from users where status='active' and created_at>=?", defaultSqlOptions);

    expect(output).toContain("SELECT\n  id,\n  email,\n  COUNT(*) AS total");
    expect(output).toContain("\nFROM users");
    expect(output).toContain("\nWHERE status='active'");
    expect(output).toContain("\n  AND created_at>=?");
  });

  it("compacts SQL while preserving keyword casing option", () => {
    const output = formatSql("select id,\n email from users", { ...defaultSqlOptions, compact: true, uppercaseKeywords: false });

    expect(output).toBe("select id, email from users");
  });

  it("formats MySQL create table definitions across multiple lines", () => {
    const output = formatSql(mysqlCreateTableSql, defaultSqlOptions);

    expect(output).toContain("CREATE TABLE `orders` (");
    expect(output).toContain("\n  `id` bigint NOT NULL AUTO_INCREMENT,");
    expect(output).toContain("\n  `amount` decimal(18, 2) NOT NULL DEFAULT '0.00',");
    expect(output).toContain("\n  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,");
    expect(output).toContain("\n  PRIMARY KEY (`id`),");
    expect(output).toContain("\n  UNIQUE KEY `uk_order_no` (`order_no`),");
    expect(output).toContain("\n  KEY `idx_user_status` (`user_id`, `status`)");
    expect(output).toContain("\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci");
    expect(output.split("\n").length).toBeGreaterThan(5);
  });

  it("is idempotent when formatting repeatedly", () => {
    const once = formatSql("select id,email,count(*) as total from users where status='active' and created_at>=?", defaultSqlOptions);
    const twice = formatSql(once, defaultSqlOptions);
    const third = formatSql(twice, defaultSqlOptions);

    expect(twice).toBe(once);
    expect(third).toBe(once);
  });

  it("extracts tables, fields, joins, conditions and parameters", () => {
    const structure = inspectSql(
      "select u.id,o.total from users u left join orders o on o.user_id = u.id where u.id = :id and o.total > ?"
    );

    expect(structure.tables).toEqual([
      { name: "users", source: "FROM" },
      { name: "orders", source: "JOIN" }
    ]);
    expect(structure.fieldCount).toBe(2);
    expect(structure.joinCount).toBe(1);
    expect(structure.conditionCount).toBe(2);
    expect(structure.parameterCount).toBe(2);
  });

  it("reports syntax-shaped issues without throwing", () => {
    const result = evaluateSql("select * from users where name = 'alice", defaultSqlOptions);

    expect(result.ok).toBe(false);
    expect(result.state).toBe("Error");
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ title: "字符串未闭合" })]));
  });

  it("warns for destructive SQL", () => {
    const dropResult = evaluateSql("drop table users;", defaultSqlOptions);
    const updateResult = evaluateSql("update users set name = 'alice' where id = 1;", defaultSqlOptions);
    const deleteResult = evaluateSql("delete from users where id = 1;", defaultSqlOptions);

    for (const result of [dropResult, updateResult, deleteResult]) {
      expect(result.ok).toBe(true);
      expect(result.state).toBe("Warning");
      expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ title: "危险语句" })]));
    }
  });

  it("does not warn for ON UPDATE in create table column definitions", () => {
    const result = evaluateSql(mysqlCreateTableSql, defaultSqlOptions);

    expect(result.state).toBe("Valid");
    expect(result.issues).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: "危险语句" })]));
  });
});
