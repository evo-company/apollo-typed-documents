import { basename, join, relative } from "path";

import type {
  DefinitionNode,
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
} from "graphql";
import { Kind } from "graphql";
import { pascalCase } from "pascal-case";
import type { TypedFilesModulesConfig } from "src/config";

type Config = Required<TypedFilesModulesConfig>;

const isOperationDefinitionNode = (
  node: DefinitionNode
): node is OperationDefinitionNode => node.kind === Kind.OPERATION_DEFINITION;

const isFragmentDefinitionNode = (
  node: DefinitionNode
): node is FragmentDefinitionNode => node.kind === Kind.FRAGMENT_DEFINITION;

export default class TypedDocumentVisitor {
  constructor(
    readonly output: string[],
    readonly location: string,
    readonly config: Config
  ) {}

  _fragmentNodeHandler(
    fragmentNodes: FragmentDefinitionNode[],
    allNodesLength: number
  ) {
    const output: string[] = [];

    fragmentNodes.forEach((fragmentNode) => {
      if (!fragmentNode.name) {
        throw new Error("Fragment must have a name");
      }
      const fragmentName = fragmentNode.name.value;
      const typeName = pascalCase(fragmentName);
      output.push(
        `  import { ${typeName} as _${typeName} } from "${this.config.typesModule}";\n`
      );
      output.push(
        `  export const ${fragmentName}: TypedDocumentNode<_${typeName}>;\n`
      );
    });

    if (
      allNodesLength === 1 &&
      fragmentNodes.length === 1 &&
      !this.config.excludeDefaultExports
    ) {
      const fragmentName = fragmentNodes[0].name?.value;

      output.push(`  export default ${fragmentName};\n`);
    }
    return output;
  }

  _operationNodeHandler(operationNodes: OperationDefinitionNode[]) {
    const output: string[] = [];
    operationNodes.forEach((operationNode) => {
      if (!operationNode.name) {
        throw new Error("Operation must have a name");
      }
      const operationName = operationNode.name.value;
      const typeName = pascalCase(operationName);
      const typeNameSuffix = pascalCase(operationNode.operation);
      const { operationResultSuffix, useOperationNameAsSuffix } = this.config;

      if (operationResultSuffix) {
        output.push(
          `  import { ${typeName}${operationResultSuffix}, ${typeName}Variables } from "${this.config.typesModule}";\n`
        );
        output.push(
          `  export const ${operationName}: TypedDocumentNode<${typeName}${operationResultSuffix}, ${typeName}Variables>;\n`
        );
      } else if (useOperationNameAsSuffix) {
        output.push(
          `  import { ${typeName}${typeNameSuffix}, ${typeName}${typeNameSuffix}Variables } from "${this.config.typesModule}";\n`
        );
        output.push(
          `  export const ${operationName}: TypedDocumentNode<${typeName}${typeNameSuffix}, ${typeName}${typeNameSuffix}Variables>;\n`
        );
        return;
      } else {
        output.push(
          `  import { ${typeName}, ${typeName}Variables } from "${this.config.typesModule}";\n`
        );
        output.push(
          `  export const ${operationName}: TypedDocumentNode<${typeName}, ${typeName}Variables>;\n`
        );
      }
    });

    if (operationNodes.length === 1 && !this.config.excludeDefaultExports) {
      const operationName = operationNodes[0].name?.value;

      output.push(`  export default ${operationName};\n`);
    }
    return output;
  }

  Document = (node: DocumentNode) => {
    const operationNodes = node.definitions.filter(isOperationDefinitionNode);
    const fragmentNodes = node.definitions.filter(isFragmentDefinitionNode);
    const allNodesLength = node.definitions.length;
    const output: string[] = [];

    const filepath = this.config.relativeToCwd
      ? relative(join(process.cwd(), this.config.stripPrefix), this.location)
      : basename(this.location);

    const modulePath = `${this.config.prefix}${filepath}`;

    output.push(`declare module "${modulePath}" {\n`);
    output.push(
      `  import { TypedDocumentNode } from "${this.config.typedDocumentNodeModule}";\n`
    );

    output.push(...this._operationNodeHandler(operationNodes));

    output.push(...this._fragmentNodeHandler(fragmentNodes, allNodesLength));

    output.push(`}`);

    this.output.push(output.join(""));

    return false; // No need to traverse deeper
  };
}
