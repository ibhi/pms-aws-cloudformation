import cloudform, { Fn, Refs, EC2, StringParameter, ResourceTag, NumberParameter, IAM, Value, Logs, Route53 } from "cloudform";
export default cloudform({
    Description: 'AWS Cloudformation template for personal media center on AWS using EC2 Spot',
    Mappings: {
        CidrMappings: {
            PublicSubnet1: {
                CIDR: '10.0.1.0/24'
            },
            PublicSubnet2: {
                CIDR: '10.0.2.0/24'
            },
            VPC: {
                CIDR: '10.0.0.0/16'
            }
        }
    },
    Parameters: {
        SourceCidr: new StringParameter({
            Description: 'Optional - CIDR/IP range for instance ssh access - defaults to 0.0.0.0/0',
            Default: '0.0.0.0/0'
        }),
        DomainName: new StringParameter({
            Description: 'Enter your custom domain name',
            Default: 'ibhi.tk'
        }),
    },
    Outputs: {
        VPC: {
            Description: 'PMS VPC Id',
            Value: Fn.Ref('VPC'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-VPC', {})
            }
        },
        PublicSubnet1: {
            Description: 'Public Subnet 1 Id',
            Value: Fn.Ref('PublicSubnet1'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-PublicSubnet1', {})
            }
        },
        PublicSubnet2: {
            Description: 'Public Subnet 2 Id',
            Value: Fn.Ref('PublicSubnet2'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-PublicSubnet2', {})
            }
        },
        HostedZone: {
            Description: '',
            Value: Fn.Ref('HostedZone'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-HostedZone', {})
            }
        },
        SecurityGroup: {
            Description: '',
            Value: Fn.GetAtt('SecurityGroup', 'GroupId'),
            Export: {
                Name: Fn.Sub('${AWS::StackName}-SecurityGroup', {})
            }
        }
    },
    Resources: {
        VPC: new EC2.VPC({
            CidrBlock: Fn.FindInMap('CidrMappings', 'VPC', 'CIDR'),
            EnableDnsHostnames: true,
            EnableDnsSupport: true,
            Tags: [
                new ResourceTag('Name', 'VPC for Personal Media Server on AWS')
            ]
        }),

        InternetGateway: new EC2.InternetGateway().dependsOn('VPC'),

        AttachGateway: new EC2.VPCGatewayAttachment({
            InternetGatewayId: Fn.Ref('InternetGateway'),
            VpcId: Fn.Ref('VPC')
        }).dependsOn(['VPC', 'InternetGateway']),

        PublicRouteTable: new EC2.RouteTable({
            VpcId: Fn.Ref('VPC'),
            Tags: [
                new ResourceTag('Name', 'Public Route Table')
            ]
        }).dependsOn(['VPC', 'AttachGateway']),

        PublicRoute: new EC2.Route({
            DestinationCidrBlock: '0.0.0.0/0',
            GatewayId: Fn.Ref('InternetGateway'),
            RouteTableId: Fn.Ref('PublicRouteTable')
        }).dependsOn(['InternetGateway', 'PublicRouteTable']),

        PublicSubnet1: new EC2.Subnet({
            AvailabilityZone: Fn.Select(0, Fn.GetAZs(Refs.Region)),
            CidrBlock: Fn.FindInMap('CidrMappings', 'PublicSubnet1', 'CIDR'),
            VpcId: Fn.Ref('VPC'),
            MapPublicIpOnLaunch: true,
            Tags: [
                new ResourceTag('Name', 'Public Subnet 1')
            ]
        }).dependsOn(['VPC']),

        PublicSubnet1RouteTableAssociation: new EC2.SubnetRouteTableAssociation({
            RouteTableId: Fn.Ref('PublicRouteTable'),
            SubnetId: Fn.Ref('PublicSubnet1')
        }).dependsOn(['PublicRouteTable', 'PublicSubnet1']),

        PublicSubnet2: new EC2.Subnet({
            AvailabilityZone: Fn.Select(1, Fn.GetAZs(Refs.Region)),
            CidrBlock: Fn.FindInMap('CidrMappings', 'PublicSubnet2', 'CIDR'),
            VpcId: Fn.Ref('VPC'),
            MapPublicIpOnLaunch: true,
            Tags: [
                new ResourceTag('Name', 'Public Subnet 2')
            ]
        }).dependsOn('VPC'),

        PublicSubnet2RouteTableAssociation: new EC2.SubnetRouteTableAssociation({
            RouteTableId: Fn.Ref('PublicRouteTable'),
            SubnetId: Fn.Ref('PublicSubnet2')
        }).dependsOn(['PublicRouteTable', 'PublicSubnet2']),
        // End of VPC

        HostedZone: new Route53.HostedZone({
            Name: Fn.Ref('DomainName')
        }),

        SecurityGroup: new EC2.SecurityGroup({
            GroupDescription: 'Personal Media Server Security Group',
            SecurityGroupIngress: [
                new EC2.SecurityGroup.Ingress({
                    CidrIp: Fn.Ref('SourceCidr'),
                    FromPort: 22,
                    ToPort: 22,
                    IpProtocol: 'tcp'
                }),
                new EC2.SecurityGroup.Ingress({
                    CidrIp: Fn.Ref('SourceCidr'),
                    FromPort: 80,
                    ToPort: 80,
                    IpProtocol: 'tcp'
                }),
                new EC2.SecurityGroup.Ingress({
                    CidrIp: Fn.Ref('SourceCidr'),
                    FromPort: 443,
                    ToPort: 443,
                    IpProtocol: 'tcp'
                })
            ],
            VpcId: Fn.Ref('VPC')
        }),
    }
});