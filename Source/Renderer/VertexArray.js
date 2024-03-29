/*global define*/
define([
        '../Core/ComponentDatatype',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/Geometry',
        '../Core/IndexDatatype',
        '../Core/Math',
        '../Core/RuntimeError',
        './Buffer',
        './BufferUsage'
    ], function(
        ComponentDatatype,
        defaultValue,
        defined,
        defineProperties,
        destroyObject,
        DeveloperError,
        Geometry,
        IndexDatatype,
        CesiumMath,
        RuntimeError,
        Buffer,
        BufferUsage) {
    "use strict";

    function addAttribute(attributes, attribute, index) {
        var hasVertexBuffer = defined(attribute.vertexBuffer);
        var hasValue = defined(attribute.value);
        var componentsPerAttribute = attribute.value ? attribute.value.length : attribute.componentsPerAttribute;

        //>>includeStart('debug', pragmas.debug);
        if (!hasVertexBuffer && !hasValue) {
            throw new DeveloperError('attribute must have a vertexBuffer or a value.');
        }
        if (hasVertexBuffer && hasValue) {
            throw new DeveloperError('attribute cannot have both a vertexBuffer and a value.  It must have either a vertexBuffer property defining per-vertex data or a value property defining data for all vertices.');
        }
        if ((componentsPerAttribute !== 1) &&
            (componentsPerAttribute !== 2) &&
            (componentsPerAttribute !== 3) &&
            (componentsPerAttribute !== 4)) {
            if (hasValue) {
                throw new DeveloperError('attribute.value.length must be in the range [1, 4].');
            }

            throw new DeveloperError('attribute.componentsPerAttribute must be in the range [1, 4].');
        }
        if (defined(attribute.componentDatatype) && !ComponentDatatype.validate(attribute.componentDatatype)) {
            throw new DeveloperError('attribute must have a valid componentDatatype or not specify it.');
        }
        if (defined(attribute.strideInBytes) && (attribute.strideInBytes > 255)) {
            // WebGL limit.  Not in GL ES.
            throw new DeveloperError('attribute must have a strideInBytes less than or equal to 255 or not specify it.');
        }
        //>>includeEnd('debug');

        // Shallow copy the attribute; we do not want to copy the vertex buffer.
        var attr = {
            index : defaultValue(attribute.index, index),
            enabled : defaultValue(attribute.enabled, true),
            vertexBuffer : attribute.vertexBuffer,
            value : hasValue ? attribute.value.slice(0) : undefined,
            componentsPerAttribute : componentsPerAttribute,
            componentDatatype : defaultValue(attribute.componentDatatype, ComponentDatatype.FLOAT),
            normalize : defaultValue(attribute.normalize, false),
            offsetInBytes : defaultValue(attribute.offsetInBytes, 0),
            strideInBytes : defaultValue(attribute.strideInBytes, 0)
        };

        if (hasVertexBuffer) {
            // Common case: vertex buffer for per-vertex data
            attr.vertexAttrib = function(gl) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer._getBuffer());
                gl.vertexAttribPointer(this.index, this.componentsPerAttribute, this.componentDatatype, this.normalize, this.strideInBytes, this.offsetInBytes);
                gl.enableVertexAttribArray(this.index);
            };

            attr.disableVertexAttribArray = function(gl) {
                gl.disableVertexAttribArray(this.index);
            };
        } else {
            // Less common case: value array for the same data for each vertex
            switch (attr.componentsPerAttribute) {
            case 1:
                attr.vertexAttrib = function(gl) {
                    gl.vertexAttrib1fv(this.index, this.value);
                };
                break;
            case 2:
                attr.vertexAttrib = function(gl) {
                    gl.vertexAttrib2fv(this.index, this.value);
                };
                break;
            case 3:
                attr.vertexAttrib = function(gl) {
                    gl.vertexAttrib3fv(this.index, this.value);
                };
                break;
            case 4:
                attr.vertexAttrib = function(gl) {
                    gl.vertexAttrib4fv(this.index, this.value);
                };
                break;
            }

            attr.disableVertexAttribArray = function(gl) {
            };
        }

        attributes.push(attr);
    }

    function bind(gl, attributes, indexBuffer) {
        for ( var i = 0; i < attributes.length; ++i) {
            var attribute = attributes[i];
            if (attribute.enabled) {
                attribute.vertexAttrib(gl);
            }
        }

        if (defined(indexBuffer)) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer._getBuffer());
        }
    }

    /**
     * Creates a vertex array, which defines the attributes making up a vertex, and contains an optional index buffer
     * to select vertices for rendering.  Attributes are defined using object literals as shown in Example 1 below.
     *
     * @param {Object} options Object with the following properties:
     * @param {Context} options.context The context in which the VertexArray gets created.
     * @param {Object[]} options.attributes An array of attributes.
     * @param {IndexBuffer} [options.indexBuffer] An optional index buffer.
     *
     * @returns {VertexArray} The vertex array, ready for use with drawing.
     *
     * @exception {DeveloperError} Attribute must have a <code>vertexBuffer</code>.
     * @exception {DeveloperError} Attribute must have a <code>componentsPerAttribute</code>.
     * @exception {DeveloperError} Attribute must have a valid <code>componentDatatype</code> or not specify it.
     * @exception {DeveloperError} Attribute must have a <code>strideInBytes</code> less than or equal to 255 or not specify it.
     * @exception {DeveloperError} Index n is used by more than one attribute.
     *
     * @see Buffer#createVertexBuffer
     * @see Buffer#createIndexBuffer
     * @see Context#draw
     *
     * @example
     * // Example 1. Create a vertex array with vertices made up of three floating point
     * // values, e.g., a position, from a single vertex buffer.  No index buffer is used.
     * var positionBuffer = Buffer.createVertexBuffer({
     *     context : context,
     *     sizeInBytes : 12,
     *     usage : BufferUsage.STATIC_DRAW
     * });
     * var attributes = [
     *     {
     *         index                  : 0,
     *         enabled                : true,
     *         vertexBuffer           : positionBuffer,
     *         componentsPerAttribute : 3,
     *         componentDatatype      : ComponentDatatype.FLOAT,
     *         normalize              : false,
     *         offsetInBytes          : 0,
     *         strideInBytes          : 0 // tightly packed
     *     }
     * ];
     * var va = new VertexArray({
     *     context : context,
     *     attributes : attributes
     * });
     *
     * @example
     * // Example 2. Create a vertex array with vertices from two different vertex buffers.
     * // Each vertex has a three-component position and three-component normal.
     * var positionBuffer = Buffer.createVertexBuffer({
     *     context : context,
     *     sizeInBytes : 12,
     *     usage : BufferUsage.STATIC_DRAW
     * });
     * var normalBuffer = Buffer.createVertexBuffer({
     *     context : context,
     *     sizeInBytes : 12,
     *     usage : BufferUsage.STATIC_DRAW
     * });
     * var attributes = [
     *     {
     *         index                  : 0,
     *         vertexBuffer           : positionBuffer,
     *         componentsPerAttribute : 3,
     *         componentDatatype      : ComponentDatatype.FLOAT
     *     },
     *     {
     *         index                  : 1,
     *         vertexBuffer           : normalBuffer,
     *         componentsPerAttribute : 3,
     *         componentDatatype      : ComponentDatatype.FLOAT
     *     }
     * ];
     * var va = new VertexArray({
     *     context : context,
     *     attributes : attributes
     * });
     *
     * @example
     * // Example 3. Creates the same vertex layout as Example 2 using a single
     * // vertex buffer, instead of two.
     * var buffer = Buffer.createVertexBuffer({
     *     context : context,
     *     sizeInBytes : 24,
     *     usage : BufferUsage.STATIC_DRAW
     * });
     * var attributes = [
     *     {
     *         vertexBuffer           : buffer,
     *         componentsPerAttribute : 3,
     *         componentDatatype      : ComponentDatatype.FLOAT,
     *         offsetInBytes          : 0,
     *         strideInBytes          : 24
     *     },
     *     {
     *         vertexBuffer           : buffer,
     *         componentsPerAttribute : 3,
     *         componentDatatype      : ComponentDatatype.FLOAT,
     *         normalize              : true,
     *         offsetInBytes          : 12,
     *         strideInBytes          : 24
     *     }
     * ];
     * var va = new VertexArray({
     *     context : context,
     *     attributes : attributes
     * });
     *
     * @private
     */
    var VertexArray = function(options) {
        options = defaultValue(options, defaultValue.EMPTY_OBJECT);

        //>>includeStart('debug', pragmas.debug);
        if (!defined(options.context)) {
            throw new DeveloperError('options.context is required.');
        }

        if (!defined(options.attributes)) {
            throw new DeveloperError('options.attributes is required.');
        }
        //>>includeEnd('debug');

        var context = options.context;
        var gl = context._gl;
        var vertexArrayObject = context._vertexArrayObject;
        var attributes = options.attributes;
        var indexBuffer = options.indexBuffer;

        var i;
        var vaAttributes = [];
        var numberOfVertices = 1;   // if every attribute is backed by a single value

        for (i = 0; i < attributes.length; ++i) {
            addAttribute(vaAttributes, attributes[i], i);
        }

        for (i = 0; i < vaAttributes.length; ++i) {
            var attribute = vaAttributes[i];

            if (defined(attribute.vertexBuffer)) {
                // This assumes that each vertex buffer in the vertex array has the same number of vertices.
                var bytes = attribute.strideInBytes || (attribute.componentsPerAttribute * ComponentDatatype.getSizeInBytes(attribute.componentDatatype));
                numberOfVertices = attribute.vertexBuffer.sizeInBytes / bytes;
                break;
            }
        }

        // Verify all attribute names are unique
        var uniqueIndices = {};
        for ( var j = 0; j < vaAttributes.length; ++j) {
            var index = vaAttributes[j].index;
            if (uniqueIndices[index]) {
                throw new DeveloperError('Index ' + index + ' is used by more than one attribute.');
            }

            uniqueIndices[index] = true;
        }

        var vao;

        // Setup VAO if extension is supported
        if (defined(vertexArrayObject)) {
            vao = vertexArrayObject.createVertexArrayOES();
            vertexArrayObject.bindVertexArrayOES(vao);
            bind(gl, vaAttributes, indexBuffer);
            vertexArrayObject.bindVertexArrayOES(null);
        }

        this._numberOfVertices = numberOfVertices;
        this._gl = gl;
        this._vaoExtension = vertexArrayObject;
        this._vao = vao;
        this._attributes = vaAttributes;
        this._indexBuffer = indexBuffer;
    };

    function computeNumberOfVertices(attribute) {
        return attribute.values.length / attribute.componentsPerAttribute;
    }

    function computeAttributeSizeInBytes(attribute) {
        return ComponentDatatype.getSizeInBytes(attribute.componentDatatype) * attribute.componentsPerAttribute;
    }

    function interleaveAttributes(attributes) {
        var j;
        var name;
        var attribute;

        // Extract attribute names.
        var names = [];
        for (name in attributes) {
            // Attribute needs to have per-vertex values; not a constant value for all vertices.
            if (attributes.hasOwnProperty(name) &&
                defined(attributes[name]) &&
                defined(attributes[name].values)) {
                names.push(name);

                if (attributes[name].componentDatatype === ComponentDatatype.DOUBLE) {
                    attributes[name].componentDatatype = ComponentDatatype.FLOAT;
                    attributes[name].values = ComponentDatatype.createTypedArray(ComponentDatatype.FLOAT, attributes[name].values);
                }
            }
        }

        // Validation.  Compute number of vertices.
        var numberOfVertices;
        var namesLength = names.length;

        if (namesLength > 0) {
            numberOfVertices = computeNumberOfVertices(attributes[names[0]]);

            for (j = 1; j < namesLength; ++j) {
                var currentNumberOfVertices = computeNumberOfVertices(attributes[names[j]]);

                if (currentNumberOfVertices !== numberOfVertices) {
                    throw new RuntimeError(
                        'Each attribute list must have the same number of vertices.  ' +
                        'Attribute ' + names[j] + ' has a different number of vertices ' +
                        '(' + currentNumberOfVertices.toString() + ')' +
                        ' than attribute ' + names[0] +
                        ' (' + numberOfVertices.toString() + ').');
                }
            }
        }

        // Sort attributes by the size of their components.  From left to right, a vertex stores floats, shorts, and then bytes.
        names.sort(function(left, right) {
            return ComponentDatatype.getSizeInBytes(attributes[right].componentDatatype) - ComponentDatatype.getSizeInBytes(attributes[left].componentDatatype);
        });

        // Compute sizes and strides.
        var vertexSizeInBytes = 0;
        var offsetsInBytes = {};

        for (j = 0; j < namesLength; ++j) {
            name = names[j];
            attribute = attributes[name];

            offsetsInBytes[name] = vertexSizeInBytes;
            vertexSizeInBytes += computeAttributeSizeInBytes(attribute);
        }

        if (vertexSizeInBytes > 0) {
            // Pad each vertex to be a multiple of the largest component datatype so each
            // attribute can be addressed using typed arrays.
            var maxComponentSizeInBytes = ComponentDatatype.getSizeInBytes(attributes[names[0]].componentDatatype); // Sorted large to small
            var remainder = vertexSizeInBytes % maxComponentSizeInBytes;
            if (remainder !== 0) {
                vertexSizeInBytes += (maxComponentSizeInBytes - remainder);
            }

            // Total vertex buffer size in bytes, including per-vertex padding.
            var vertexBufferSizeInBytes = numberOfVertices * vertexSizeInBytes;

            // Create array for interleaved vertices.  Each attribute has a different view (pointer) into the array.
            var buffer = new ArrayBuffer(vertexBufferSizeInBytes);
            var views = {};

            for (j = 0; j < namesLength; ++j) {
                name = names[j];
                var sizeInBytes = ComponentDatatype.getSizeInBytes(attributes[name].componentDatatype);

                views[name] = {
                    pointer : ComponentDatatype.createTypedArray(attributes[name].componentDatatype, buffer),
                    index : offsetsInBytes[name] / sizeInBytes, // Offset in ComponentType
                    strideInComponentType : vertexSizeInBytes / sizeInBytes
                };
            }

            // Copy attributes into one interleaved array.
            // PERFORMANCE_IDEA:  Can we optimize these loops?
            for (j = 0; j < numberOfVertices; ++j) {
                for ( var n = 0; n < namesLength; ++n) {
                    name = names[n];
                    attribute = attributes[name];
                    var values = attribute.values;
                    var view = views[name];
                    var pointer = view.pointer;

                    var numberOfComponents = attribute.componentsPerAttribute;
                    for ( var k = 0; k < numberOfComponents; ++k) {
                        pointer[view.index + k] = values[(j * numberOfComponents) + k];
                    }

                    view.index += view.strideInComponentType;
                }
            }

            return {
                buffer : buffer,
                offsetsInBytes : offsetsInBytes,
                vertexSizeInBytes : vertexSizeInBytes
            };
        }

        // No attributes to interleave.
        return undefined;
    }

    /**
     * Creates a vertex array from a geometry.  A geometry contains vertex attributes and optional index data
     * in system memory, whereas a vertex array contains vertex buffers and an optional index buffer in WebGL
     * memory for use with rendering.
     * <br /><br />
     * The <code>geometry</code> argument should use the standard layout like the geometry returned by {@link BoxGeometry}.
     * <br /><br />
     * <code>options</code> can have four properties:
     * <ul>
     *   <li><code>geometry</code>:  The source geometry containing data used to create the vertex array.</li>
     *   <li><code>attributeLocations</code>:  An object that maps geometry attribute names to vertex shader attribute locations.</li>
     *   <li><code>bufferUsage</code>:  The expected usage pattern of the vertex array's buffers.  On some WebGL implementations, this can significantly affect performance.  See {@link BufferUsage}.  Default: <code>BufferUsage.DYNAMIC_DRAW</code>.</li>
     *   <li><code>interleave</code>:  Determines if all attributes are interleaved in a single vertex buffer or if each attribute is stored in a separate vertex buffer.  Default: <code>false</code>.</li>
     * </ul>
     * <br />
     * If <code>options</code> is not specified or the <code>geometry</code> contains no data, the returned vertex array is empty.
     *
     * @param {Object} options An object defining the geometry, attribute indices, buffer usage, and vertex layout used to create the vertex array.
     *
     * @exception {RuntimeError} Each attribute list must have the same number of vertices.
     * @exception {DeveloperError} The geometry must have zero or one index lists.
     * @exception {DeveloperError} Index n is used by more than one attribute.
     *
     * @see Buffer#createVertexBuffer
     * @see Buffer#createIndexBuffer
     * @see GeometryPipeline.createAttributeLocations
     * @see ShaderProgram
     *
     * @example
     * // Example 1. Creates a vertex array for rendering a box.  The default dynamic draw
     * // usage is used for the created vertex and index buffer.  The attributes are not
     * // interleaved by default.
     * var geometry = new BoxGeometry();
     * var va = VertexArray.fromGeometry({
     *     context            : context,
     *     geometry           : geometry,
     *     attributeLocations : GeometryPipeline.createAttributeLocations(geometry),
     * });
     *
     * @example
     * // Example 2. Creates a vertex array with interleaved attributes in a
     * // single vertex buffer.  The vertex and index buffer have static draw usage.
     * var va = VertexArray.fromGeometry({
     *     context            : context,
     *     geometry           : geometry,
     *     attributeLocations : GeometryPipeline.createAttributeLocations(geometry),
     *     bufferUsage        : BufferUsage.STATIC_DRAW,
     *     interleave         : true
     * });
     *
     * @example
     * // Example 3.  When the caller destroys the vertex array, it also destroys the
     * // attached vertex buffer(s) and index buffer.
     * va = va.destroy();
     */
    VertexArray.fromGeometry = function(options) {
        options = defaultValue(options, defaultValue.EMPTY_OBJECT);

        //>>includeStart('debug', pragmas.debug);
        if (!defined(options.context)) {
            throw new DeveloperError('options.context is required.');
        }
        //>>includeEnd('debug');

        var context = options.context;
        var geometry = defaultValue(options.geometry, defaultValue.EMPTY_OBJECT);

        var bufferUsage = defaultValue(options.bufferUsage, BufferUsage.DYNAMIC_DRAW);

        var attributeLocations = defaultValue(options.attributeLocations, defaultValue.EMPTY_OBJECT);
        var interleave = defaultValue(options.interleave, false);
        var createdVAAttributes = options.vertexArrayAttributes;

        var name;
        var attribute;
        var vertexBuffer;
        var vaAttributes = (defined(createdVAAttributes)) ? createdVAAttributes : [];
        var attributes = geometry.attributes;

        if (interleave) {
            // Use a single vertex buffer with interleaved vertices.
            var interleavedAttributes = interleaveAttributes(attributes);
            if (defined(interleavedAttributes)) {
                vertexBuffer = Buffer.createVertexBuffer({
                    context : context,
                    typedArray : interleavedAttributes.buffer,
                    usage : bufferUsage
                });
                var offsetsInBytes = interleavedAttributes.offsetsInBytes;
                var strideInBytes = interleavedAttributes.vertexSizeInBytes;

                for (name in attributes) {
                    if (attributes.hasOwnProperty(name) && defined(attributes[name])) {
                        attribute = attributes[name];

                        if (defined(attribute.values)) {
                            // Common case: per-vertex attributes
                            vaAttributes.push({
                                index : attributeLocations[name],
                                vertexBuffer : vertexBuffer,
                                componentDatatype : attribute.componentDatatype,
                                componentsPerAttribute : attribute.componentsPerAttribute,
                                normalize : attribute.normalize,
                                offsetInBytes : offsetsInBytes[name],
                                strideInBytes : strideInBytes
                            });
                        } else {
                            // Constant attribute for all vertices
                            vaAttributes.push({
                                index : attributeLocations[name],
                                value : attribute.value,
                                componentDatatype : attribute.componentDatatype,
                                normalize : attribute.normalize
                            });
                        }
                    }
                }
            }
        } else {
            // One vertex buffer per attribute.
            for (name in attributes) {
                if (attributes.hasOwnProperty(name) && defined(attributes[name])) {
                    attribute = attributes[name];

                    var componentDatatype = attribute.componentDatatype;
                    if (componentDatatype === ComponentDatatype.DOUBLE) {
                        componentDatatype = ComponentDatatype.FLOAT;
                    }

                    vertexBuffer = undefined;
                    if (defined(attribute.values)) {
                        vertexBuffer = Buffer.createVertexBuffer({
                            context : context,
                            typedArray : ComponentDatatype.createTypedArray(componentDatatype, attribute.values),
                            usage : bufferUsage
                        });
                    }

                    vaAttributes.push({
                        index : attributeLocations[name],
                        vertexBuffer : vertexBuffer,
                        value : attribute.value,
                        componentDatatype : componentDatatype,
                        componentsPerAttribute : attribute.componentsPerAttribute,
                        normalize : attribute.normalize
                    });
                }
            }
        }

        var indexBuffer;
        var indices = geometry.indices;
        if (defined(indices)) {
            if ((Geometry.computeNumberOfVertices(geometry) > CesiumMath.SIXTY_FOUR_KILOBYTES) && context.elementIndexUint) {
                indexBuffer = Buffer.createIndexBuffer({
                    context : context,
                    typedArray : new Uint32Array(indices),
                    usage : bufferUsage,
                    indexDatatype : IndexDatatype.UNSIGNED_INT
                });
            } else{
                indexBuffer = Buffer.createIndexBuffer({
                    context : context,
                    typedArray : new Uint16Array(indices),
                    usage : bufferUsage,
                    indexDatatype : IndexDatatype.UNSIGNED_SHORT
                });
            }
        }

        return new VertexArray({
            context : context,
            attributes : vaAttributes,
            indexBuffer : indexBuffer
        });
    };

    defineProperties(VertexArray.prototype, {
        numberOfAttributes : {
            get : function() {
                return this._attributes.length;
            }
        },
        numberOfVertices : {
            get : function() {
                return this._numberOfVertices;
            }
        },
        indexBuffer : {
            get : function() {
                return this._indexBuffer;
            }
        }
    });

    /**
     * index is the location in the array of attributes, not the index property of an attribute.
     */
    VertexArray.prototype.getAttribute = function(index) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(index)) {
            throw new DeveloperError('index is required.');
        }
        //>>includeEnd('debug');

        return this._attributes[index];
    };

    VertexArray.prototype._bind = function() {
        if (defined(this._vao)) {
            this._vaoExtension.bindVertexArrayOES(this._vao);
        } else {
            bind(this._gl, this._attributes, this._indexBuffer);
        }
    };

    VertexArray.prototype._unBind = function() {
        if (defined(this._vao)) {
            this._vaoExtension.bindVertexArrayOES(null);
        } else {
            var attributes = this._attributes;
            var gl = this._gl;

            for ( var i = 0; i < attributes.length; ++i) {
                var attribute = attributes[i];
                if (attribute.enabled) {
                    attribute.disableVertexAttribArray(gl);
                }
            }
            if (this._indexBuffer) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            }
        }
    };

    VertexArray.prototype.isDestroyed = function() {
        return false;
    };

    VertexArray.prototype.destroy = function() {
        var attributes = this._attributes;
        for ( var i = 0; i < attributes.length; ++i) {
            var vertexBuffer = attributes[i].vertexBuffer;
            if (defined(vertexBuffer) && !vertexBuffer.isDestroyed() && vertexBuffer.vertexArrayDestroyable) {
                vertexBuffer.destroy();
            }
        }

        var indexBuffer = this._indexBuffer;
        if (defined(indexBuffer) && !indexBuffer.isDestroyed() && indexBuffer.vertexArrayDestroyable) {
            indexBuffer.destroy();
        }

        if (defined(this._vao)) {
            this._vaoExtension.deleteVertexArrayOES(this._vao);
        }

        return destroyObject(this);
    };

    return VertexArray;
});